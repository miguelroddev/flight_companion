"""List airports that sit almost on top of each other.

Two pins in one place usually mean one of two data problems: one airport
listed under two codes (BSL and MLH are both EuroAirport Basel-Mulhouse, and
PBI became DJT but some routes still use the old code), or an airport the
scrape put at another airport's coordinates. Further apart, they are mostly
real neighbours: a city's second airport, a seaplane base, two towns either
side of a border.

Run with: docker compose exec backend python -m app.close_airports
          docker compose exec backend python -m app.close_airports --km 5
"""
import argparse
import math
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.database import SessionLocal
from app.models import Airline, Airport, Route

# Closer than this, two airports are practically the same spot: no two real
# airports' reference points sit this close together.
SAME_SPOT_KM = 1.0

DEFAULT_MAX_KM = 15.0


@dataclass(frozen=True)
class Spot:
    iata: str
    icao: str | None
    name: str
    city: str
    country: str
    lat: float
    lng: float


@dataclass
class Links:
    """What flies to and from an airport, in either direction."""

    airports: set[str]
    airlines: set[str]


@dataclass(frozen=True)
class ClosePair:
    km: float
    one: Spot
    other: Spot


def distance_km(one: Spot, other: Spot) -> float:
    """Haversine, unrounded: the pairs that matter are well under a km apart."""
    lat1, lat2 = math.radians(one.lat), math.radians(other.lat)
    half_dlat = (lat2 - lat1) / 2
    half_dlng = math.radians(other.lng - one.lng) / 2
    h = math.sin(half_dlat) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(half_dlng) ** 2
    return 2 * 6371 * math.asin(min(1.0, math.sqrt(h)))


def close_pairs(spots: dict[str, Spot], max_km: float) -> list[ClosePair]:
    """Every pair within max_km, closest first.

    Airports are bucketed into cells of half a degree and only neighbouring
    cells compared, rather than all ~7 million pairs. Half a degree of
    latitude is ~55 km, and a degree of longitude narrows towards the poles,
    so the longitude reach widens with latitude to never miss a pair.
    """
    cell = 0.5
    cells: dict[tuple[int, int], list[Spot]] = defaultdict(list)
    for spot in spots.values():
        cells[(math.floor(spot.lat / cell), math.floor(spot.lng / cell))].append(spot)

    lat_reach = math.ceil(max_km / (111 * cell))
    found: dict[tuple[str, str], ClosePair] = {}
    for (row, col), members in cells.items():
        # The narrowest longitude degree in this band of rows decides how
        # many columns over a pair can still be.
        edge_lat = min(89.0, (abs(row) + lat_reach + 1) * cell)
        lng_reach = math.ceil(max_km / (111 * math.cos(math.radians(edge_lat)) * cell))
        for d_row in range(-lat_reach, lat_reach + 1):
            for d_col in range(-lng_reach, lng_reach + 1):
                for other in cells.get((row + d_row, col + d_col), ()):
                    for one in members:
                        if one.iata >= other.iata:
                            continue
                        km = distance_km(one, other)
                        if km <= max_km:
                            found[(one.iata, other.iata)] = ClosePair(km, one, other)
    # Pairs across the antimeridian (lng -180/180) are not looked for: no two
    # airports with routes sit close to it on either side.
    return sorted(found.values(), key=lambda pair: (pair.km, pair.one.iata))


def verdict(pair: ClosePair, links: dict[str, Links]) -> str:
    if pair.km < SAME_SPOT_KM:
        return "SAME SPOT: one airport under two codes, or one of them at the wrong coordinates"
    if pair.other.iata in links[pair.one.iata].airports:
        return "separate: there are flights between them"
    return "nearby: most likely two real airports"


def count(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def describe(spot: Spot, link: Links) -> str:
    icao = f" ({spot.icao})" if spot.icao else ""
    where = ", ".join(part for part in (spot.city, spot.country) if part)
    return f"{spot.iata}  {spot.name}{icao}, {where} · {count(len(link.airports), 'airport')} served"


def report(pairs: list[ClosePair], links: dict[str, Links], max_km: float) -> str:
    same_spot = sum(1 for pair in pairs if pair.km < SAME_SPOT_KM)
    lines = [
        f"{count(len(pairs), 'airport pair')} within {max_km:g} km of each other, "
        f"{same_spot} of them under {SAME_SPOT_KM:g} km apart.",
        "",
    ]
    for pair in pairs:
        one, other = links[pair.one.iata], links[pair.other.iata]
        shared_airports = len((one.airports & other.airports) - {pair.one.iata, pair.other.iata})
        shared_airlines = len(one.airlines & other.airlines)
        lines += [
            f"{pair.km:6.2f} km  {describe(pair.one, one)}",
            f"{'':10}{describe(pair.other, other)}",
            f"{'':10}{count(shared_airports, 'airport')} and {count(shared_airlines, 'airline')} in common",
            f"{'':10}-> {verdict(pair, links)}",
            "",
        ]
    return "\n".join(lines)


def load() -> tuple[dict[str, Spot], dict[str, Links]]:
    db = SessionLocal()
    try:
        spots = {
            iata: Spot(iata, icao, name, city, country, lat, lng)
            for iata, icao, name, city, country, lat, lng in db.execute(
                select(
                    Airport.iata_code,
                    Airport.icao_code,
                    Airport.name,
                    Airport.city,
                    Airport.country,
                    Airport.latitude,
                    Airport.longitude,
                )
            )
        }
        links = {iata: Links(set(), set()) for iata in spots}
        source = aliased(Airport)
        destination = aliased(Airport)
        rows = db.execute(
            select(source.iata_code, destination.iata_code, Airline.iata_code)
            .select_from(Route)
            .join(source, Route.source_airport_id == source.id)
            .join(destination, Route.destination_airport_id == destination.id)
            .join(Airline, Route.airline_id == Airline.id)
        )
        for from_iata, to_iata, airline in rows:
            for here, there in ((from_iata, to_iata), (to_iata, from_iata)):
                links[here].airports.add(there)
                if airline:
                    links[here].airlines.add(airline)
        return spots, links
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--km",
        type=float,
        default=DEFAULT_MAX_KM,
        help=f"how close counts as close (default {DEFAULT_MAX_KM:g})",
    )
    args = parser.parse_args()

    spots, links = load()
    print(report(close_pairs(spots, args.km), links, args.km))


if __name__ == "__main__":
    main()
