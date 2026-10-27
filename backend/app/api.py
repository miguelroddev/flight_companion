import random
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, aliased, joinedload

from app.database import get_db
from app.models import Airline, Airport, Route
from app.route_filters import RouteFilterParams, RouteFilters
from app.route_game import MAX_FLIGHTS, RouteGraph, great_circle_km, score
from app.schemas import (
    AirlineOut,
    AirlineServiceOut,
    AirportOut,
    Difficulty,
    GamePuzzleOut,
    GameResultOut,
    GameRouteOut,
    ItinerariesOut,
    ItineraryOut,
    RouteOut,
)

router = APIRouter(prefix="/api")

# Two-stop combinations between big airports run into the thousands; only the
# fastest are worth showing. One-stop options are always returned in full.
MAX_TWO_STOP_ITINERARIES = 10

DbSession = Annotated[Session, Depends(get_db)]


def outbound_route_counts(
    db: Session,
    airport_ids: Iterable[int] | None = None,
) -> dict[int, int]:
    """Outbound route rows per airport id, in a single grouped query.

    Pass no ids to count every airport, which is cheaper than an IN clause
    listing the whole dataset.

    Always every route, never just the ones matching the filters: the count
    sizes and colours the map pins, and a hub must still read as a hub while
    filters thin out what is shown around it.
    """
    statement = select(Route.source_airport_id, func.count()).group_by(
        Route.source_airport_id
    )
    if airport_ids is not None:
        statement = statement.where(Route.source_airport_id.in_(airport_ids))
    return dict(db.execute(statement).all())


def get_airport_or_404(db: Session, iata: str) -> Airport:
    airport = db.scalar(select(Airport).where(Airport.iata_code == iata.upper()))
    if airport is None:
        raise HTTPException(status_code=404, detail=f"Airport {iata.upper()} not found")
    return airport


@router.get("/airports", response_model=list[AirportOut])
def list_airports(db: DbSession, filters: RouteFilterParams):
    statement = select(Airport).order_by(Airport.iata_code)
    if filters.conditions():
        # Served in either direction, so an airport that matching routes only
        # fly into still gets a pin.
        served = filters.apply(select(Route.source_airport_id)).union(
            filters.apply(select(Route.destination_airport_id))
        )
        statement = statement.where(Airport.id.in_(served))

    airports = db.scalars(statement).all()
    counts = outbound_route_counts(db)
    return [
        AirportOut.from_model(airport, counts.get(airport.id, 0))
        for airport in airports
    ]


@router.get("/airports/{iata}", response_model=AirportOut)
def get_airport(iata: str, db: DbSession):
    airport = get_airport_or_404(db, iata)
    counts = outbound_route_counts(db, [airport.id])
    return AirportOut.from_model(airport, counts.get(airport.id, 0))


@router.get("/airports/{iata}/routes", response_model=list[AirportOut])
def list_connected_airports(
    iata: str,
    db: DbSession,
    filters: RouteFilterParams,
    direction: Literal["outbound", "inbound"] = "outbound",
):
    """Airports reachable from (outbound) or flying into (inbound) this airport."""
    airport = get_airport_or_404(db, iata)

    if direction == "outbound":
        join_column, filter_column = Route.destination_airport_id, Route.source_airport_id
    else:
        join_column, filter_column = Route.source_airport_id, Route.destination_airport_id

    statement = (
        select(Airport)
        .join(Route, join_column == Airport.id)
        .where(filter_column == airport.id)
        .distinct()
        .order_by(Airport.iata_code)
    )
    connected = db.scalars(filters.apply(statement)).all()
    counts = outbound_route_counts(db, [a.id for a in connected])
    return [AirportOut.from_model(a, counts.get(a.id, 0)) for a in connected]


@router.get("/routes", response_model=RouteOut)
def get_route(
    db: DbSession,
    departure: Annotated[str, Query(alias="from")],
    arrival: Annotated[str, Query(alias="to")],
    filters: RouteFilterParams,
):
    """All airline services flying departure -> arrival (one direction only)."""
    departure_airport = get_airport_or_404(db, departure)
    arrival_airport = get_airport_or_404(db, arrival)

    statement = (
        select(Route)
        .options(joinedload(Route.airline))
        .where(
            Route.source_airport_id == departure_airport.id,
            Route.destination_airport_id == arrival_airport.id,
        )
        .join(Route.airline)
        .order_by(Airline.name)
    )
    rows = db.scalars(filters.apply(statement)).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No route from {departure_airport.iata_code} to {arrival_airport.iata_code}",
        )

    durations = [row.duration_minutes for row in rows if row.duration_minutes is not None]
    counts = outbound_route_counts(db, [departure_airport.id, arrival_airport.id])
    return RouteOut(
        departure=AirportOut.from_model(
            departure_airport, counts.get(departure_airport.id, 0)
        ),
        arrival=AirportOut.from_model(arrival_airport, counts.get(arrival_airport.id, 0)),
        duration_minutes=min(durations) if durations else None,
        services=[
            AirlineServiceOut(
                airline=AirlineOut.from_model(row.airline),
                operating_days=row.operating_days,
            )
            for row in rows
        ],
    )


def leg_minutes(
    db: Session, filters: RouteFilters, *conditions: ColumnElement[bool]
) -> dict[tuple[int, int], int]:
    """Fastest flying time for each (source, destination) airport-id pair that
    matching routes connect, narrowed by conditions on Route. Pairs with no
    known duration are left out, as they cannot be ranked."""
    statement = filters.apply(
        select(
            Route.source_airport_id,
            Route.destination_airport_id,
            func.min(Route.duration_minutes),
        )
        .where(*conditions)
        .group_by(Route.source_airport_id, Route.destination_airport_id)
    )
    return {
        (source, destination): minutes
        for source, destination, minutes in db.execute(statement)
        if minutes is not None
    }


@router.get("/itineraries", response_model=ItinerariesOut)
def list_itineraries(
    db: DbSession,
    departure: Annotated[str, Query(alias="from")],
    arrival: Annotated[str, Query(alias="to")],
    filters: RouteFilterParams,
):
    """Ways to fly departure -> arrival with one stop, or, only if there are
    none, with two. Every leg must satisfy the filters.

    All one-stop options are returned; of two-stop ones only the fastest few.
    Ranked by total flying time: with no schedules, layovers are unknown.
    """
    departure_airport = get_airport_or_404(db, departure)
    arrival_airport = get_airport_or_404(db, arrival)
    if departure_airport.id == arrival_airport.id:
        return ItinerariesOut(stops=None, itineraries=[])

    # First legs keyed by where they land, last legs by where they leave from.
    # A first leg straight to the arrival is a direct flight, not a stop, and
    # a last leg from the departure would double back through it.
    first = {
        stop: minutes
        for (_, stop), minutes in leg_minutes(
            db, filters, Route.source_airport_id == departure_airport.id
        ).items()
        if stop != arrival_airport.id
    }
    last = {
        stop: minutes
        for (stop, _), minutes in leg_minutes(
            db, filters, Route.destination_airport_id == arrival_airport.id
        ).items()
        if stop != departure_airport.id
    }

    # (stop ids, leg minutes)
    found: list[tuple[list[int], list[int]]] = [
        ([stop], [first[stop], last[stop]]) for stop in first.keys() & last.keys()
    ]
    stops = 1
    if not found and first and last:
        middle = leg_minutes(
            db,
            filters,
            Route.source_airport_id.in_(list(first)),
            Route.destination_airport_id.in_(list(last)),
        )
        found = [
            ([one, two], [first[one], minutes, last[two]])
            for (one, two), minutes in middle.items()
        ]
        found.sort(key=lambda option: sum(option[1]))
        found = found[:MAX_TWO_STOP_ITINERARIES]
        stops = 2

    stop_ids = sorted({stop for stop_list, _ in found for stop in stop_list})
    airports = {
        airport.id: airport
        for airport in db.scalars(select(Airport).where(Airport.id.in_(stop_ids)))
    }
    counts = outbound_route_counts(db, stop_ids)

    itineraries = [
        ItineraryOut(
            via=[
                AirportOut.from_model(airports[stop], counts.get(stop, 0))
                for stop in stop_list
            ],
            leg_minutes=minutes,
            total_minutes=sum(minutes),
        )
        for stop_list, minutes in found
    ]
    # Ties broken by the stops' codes, so the order is stable between calls.
    itineraries.sort(
        key=lambda itinerary: (
            itinerary.total_minutes,
            [airport.iata for airport in itinerary.via],
        )
    )
    return ItinerariesOut(stops=stops if itineraries else None, itineraries=itineraries)


@router.get("/network", response_model=list[tuple[str, str]])
def get_network(db: DbSession, filters: RouteFilterParams):
    """Every airport pair the chosen airlines fly between, as [iata, iata],
    once per pair whichever direction is flown. The other filters narrow it
    as usual.

    Only answers for an airline filter: unfiltered, this would be every one
    of the ~30k pairs in the dataset, far more than the map should draw.
    """
    if not filters.airlines:
        return []

    source = aliased(Airport)
    destination = aliased(Airport)
    pairs = db.execute(
        filters.apply(
            select(source.iata_code, destination.iata_code)
            .select_from(Route)
            .join(source, Route.source_airport_id == source.id)
            .join(destination, Route.destination_airport_id == destination.id)
            .distinct()
        )
    ).all()
    return sorted({tuple(sorted(pair)) for pair in pairs})


@router.get("/airlines", response_model=list[AirlineOut])
def list_airlines(db: DbSession):
    """Every airline flying at least one route, by name: the Airlines filter's
    options."""
    airlines = db.scalars(
        select(Airline)
        .where(Airline.id.in_(select(Route.airline_id)))
        .order_by(Airline.name)
    ).all()
    return [AirlineOut.from_model(airline) for airline in airlines]


@router.get("/airlines/{code}", response_model=AirlineOut)
def get_airline(code: str, db: DbSession):
    airline = db.scalar(select(Airline).where(Airline.iata_code == code.upper()))
    if airline is None:
        raise HTTPException(status_code=404, detail=f"Airline {code.upper()} not found")
    return AirlineOut.from_model(airline)


# The whole network, for the route game. Built on first use and kept for the
# life of the process: a few MB, and every game needs all of it. Routes are
# only ever re-imported offline, and the backend restarted, so it never goes
# stale under a running server.
_route_graph: RouteGraph | None = None


def route_graph(db: Session) -> RouteGraph:
    global _route_graph
    if _route_graph is None:
        counts = outbound_route_counts(db)
        airports = {
            airport.iata_code: AirportOut.from_model(airport, counts.get(airport.id, 0))
            for airport in db.scalars(select(Airport))
        }
        iata_by_id = {
            airport_id: iata
            for airport_id, iata in db.execute(select(Airport.id, Airport.iata_code))
        }
        legs: dict[str, dict[str, int]] = {}
        pairs = db.execute(
            select(
                Route.source_airport_id,
                Route.destination_airport_id,
                func.min(Route.distance_km),
            ).group_by(Route.source_airport_id, Route.destination_airport_id)
        )
        for source_id, destination_id, km in pairs:
            source, destination = iata_by_id[source_id], iata_by_id[destination_id]
            if km is None:
                km = great_circle_km(airports[source], airports[destination])
            legs.setdefault(source, {})[destination] = km
        _route_graph = RouteGraph(airports, legs)
    return _route_graph


def game_route(graph: RouteGraph, path: list[str]) -> GameRouteOut:
    """Of a route known to be flyable."""
    leg_km = [graph.legs[source][destination] for source, destination in zip(path, path[1:])]
    return GameRouteOut(
        airports=[graph.airports[iata] for iata in path],
        leg_km=leg_km,
        total_km=sum(leg_km),
    )


def best_game_route(graph: RouteGraph, departure: str, arrival: str) -> list[str]:
    for iata in (departure, arrival):
        if iata not in graph.airports:
            raise HTTPException(status_code=404, detail=f"Airport {iata} not found")
    best = graph.best_route(departure, arrival)
    if best is None:
        raise HTTPException(
            status_code=404, detail=f"No way to fly from {departure} to {arrival}"
        )
    return best


@router.get("/game/puzzle", response_model=GamePuzzleOut)
def get_game_puzzle(
    db: DbSession,
    difficulty: Difficulty = "medium",
    daily: bool = False,
    seed: Annotated[int | None, Query(ge=0)] = None,
):
    """A route game. The daily one is the same for everyone all day (UTC);
    otherwise the seed picks it, or a random one is dealt without one."""
    graph = route_graph(db)
    today = datetime.now(timezone.utc).date() if daily else None
    if today is not None:
        seed = today.toordinal()
    elif seed is None:
        seed = random.randrange(1_000_000_000)

    try:
        departure, arrival = graph.make_puzzle(difficulty, seed)
    except LookupError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return GamePuzzleOut(
        difficulty=difficulty,
        seed=seed,
        daily=today,
        departure=graph.airports[departure],
        arrival=graph.airports[arrival],
        max_flights=MAX_FLIGHTS,
    )


@router.get("/game/best", response_model=GameRouteOut)
def get_best_game_route(
    db: DbSession,
    departure: Annotated[str, Query(alias="from")],
    arrival: Annotated[str, Query(alias="to")],
):
    """The best route between two airports, for a player who gives up."""
    graph = route_graph(db)
    return game_route(graph, best_game_route(graph, departure.upper(), arrival.upper()))


@router.get("/game/score", response_model=GameResultOut)
def score_game_route(
    db: DbSession,
    # Repeated, in flying order: ?path=LIS&path=FRA&path=NRT
    path: Annotated[list[str], Query(min_length=2, max_length=MAX_FLIGHTS + 1)],
):
    """A finished route, scored against the best one between its ends."""
    graph = route_graph(db)
    path = [iata.upper() for iata in path]
    if path[0] == path[-1]:
        raise HTTPException(status_code=422, detail="The route must end somewhere else")
    for source, destination in zip(path, path[1:]):
        if graph.leg_km(source, destination) is None:
            raise HTTPException(
                status_code=422, detail=f"No flight from {source} to {destination}"
            )

    best = best_game_route(graph, path[0], path[-1])
    return GameResultOut(
        route=game_route(graph, path),
        best=game_route(graph, best),
        score=score(graph.cost(best), graph.cost(path)),
    )
