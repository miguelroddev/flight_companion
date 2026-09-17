from collections.abc import Iterable
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Airline, Airport, Route
from app.schemas import AirlineOut, AirlineServiceOut, AirportOut, RouteOut

router = APIRouter(prefix="/api")

DbSession = Annotated[Session, Depends(get_db)]


def outbound_route_counts(
    db: Session, airport_ids: Iterable[int] | None = None
) -> dict[int, int]:
    """Outbound route rows per airport id, in a single grouped query.

    Pass no ids to count every airport, which is cheaper than an IN clause
    listing the whole dataset.
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
def list_airports(db: DbSession):
    airports = db.scalars(select(Airport).order_by(Airport.iata_code)).all()
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
    direction: Literal["outbound", "inbound"] = "outbound",
):
    """Airports reachable from (outbound) or flying into (inbound) this airport."""
    airport = get_airport_or_404(db, iata)

    if direction == "outbound":
        join_column, filter_column = Route.destination_airport_id, Route.source_airport_id
    else:
        join_column, filter_column = Route.source_airport_id, Route.destination_airport_id

    connected = db.scalars(
        select(Airport)
        .join(Route, join_column == Airport.id)
        .where(filter_column == airport.id)
        .distinct()
        .order_by(Airport.iata_code)
    ).all()
    counts = outbound_route_counts(db, [a.id for a in connected])
    return [AirportOut.from_model(a, counts.get(a.id, 0)) for a in connected]


@router.get("/routes", response_model=RouteOut)
def get_route(
    db: DbSession,
    departure: Annotated[str, Query(alias="from")],
    arrival: Annotated[str, Query(alias="to")],
):
    """All airline services flying departure -> arrival (one direction only)."""
    departure_airport = get_airport_or_404(db, departure)
    arrival_airport = get_airport_or_404(db, arrival)

    rows = db.scalars(
        select(Route)
        .options(joinedload(Route.airline))
        .where(
            Route.source_airport_id == departure_airport.id,
            Route.destination_airport_id == arrival_airport.id,
        )
        .join(Route.airline)
        .order_by(Airline.name)
    ).all()
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


@router.get("/airlines/{code}", response_model=AirlineOut)
def get_airline(code: str, db: DbSession):
    airline = db.scalar(select(Airline).where(Airline.iata_code == code.upper()))
    if airline is None:
        raise HTTPException(status_code=404, detail=f"Airline {code.upper()} not found")
    return AirlineOut.from_model(airline)
