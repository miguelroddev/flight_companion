"""Wipe the airports/airlines/routes tables and repopulate them from
backend/data/airline_routes.json.

Generate that file first with:
    python backend/data/scrape_airline_routes.py

Run with: docker compose exec backend python -m app.import_routes
"""
import json
import math
import sys
from pathlib import Path

from sqlalchemy import insert, select, text

from app.alliances import assign_alliances
from app.database import SessionLocal
from app.models import Airline, Airport, Route

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "airline_routes.json"

# Airport pairs the scrape has routes between that no airline flies, checked
# by hand. Dropped in both directions on every import. Migration 0006 removed
# the ones imported before they were listed here; list a new pair in a new
# migration too, or the live data keeps it until the next re-import.
BOGUS_ROUTES = {
    # Karshi, Uzbekistan to Resende, a small airfield in Brazil: a 19-hour
    # "Uzbekistan Airways" flight that does not exist.
    frozenset({"KSQ", "REZ"}),
}

# One airport the scrape lists under two codes, checked by hand (found with
# app/close_airports.py): the second code's routes move onto the first and
# the second is dropped, so the map shows one pin. Migration 0007 merged the
# ones imported before they were listed; list a new one in a new migration
# too.
AIRPORT_MERGES = {
    # Palm Beach's code changed from PBI to DJT in 2026, and a few routes
    # are still filed under the old one.
    "PBI": "DJT",
    # EuroAirport Basel-Mulhouse-Freiburg has a Swiss code (BSL) and a French
    # one (MLH), and airlines file under either. BSL's city already names
    # Mulhouse, so a search for it still finds the airport.
    "MLH": "BSL",
}

# Airports the scrape describes wrongly, checked by hand: these fields
# replace the scrape's. As with the merges, migration 0007 fixed the ones
# imported before they were listed.
AIRPORT_FIXES: dict[str, dict] = {
    # Itilleq's heliport, 45 km south of Sisimiut (its one route), was put on
    # top of Ilulissat airport, 300 km north.
    "QJG": {"latitude": 66.57778, "longitude": -53.5},
    # AHA is Maa Mahamaya Airport in Ambikapur, India, as its Alliance Air
    # routes to Delhi and Kolkata say. The scrape had it as Naha Air Force
    # Base, on top of Okinawa's airport.
    "AHA": {
        "icao_code": "VEAP",
        "name": "Maa Mahamaya Airport",
        "city": "Ambikapur",
        "country": "India",
        "latitude": 22.98725,
        "longitude": 83.196139,
    },
}


def parse_coordinate(value: object) -> float | None:
    """The scrape occasionally yields null, or a stray trailing comma."""
    if value is None:
        return None
    try:
        return float(str(value).split(",")[0])
    except ValueError:
        return None


def great_circle_km(source: dict, destination: dict) -> int:
    """Haversine distance between two collected airports. Matches the SQL
    backfill in migration 0005, so imported and migrated rows agree."""
    lat1, lat2 = math.radians(source["latitude"]), math.radians(destination["latitude"])
    half_dlat = (lat2 - lat1) / 2
    half_dlng = math.radians(destination["longitude"] - source["longitude"]) / 2
    h = math.sin(half_dlat) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(half_dlng) ** 2
    return round(2 * 6371 * math.asin(min(1.0, math.sqrt(h))))


def collect_airports(raw: dict) -> dict[str, dict]:
    """Airports usable as a map pin, keyed by IATA. Merged-away codes are
    left out, and AIRPORT_FIXES applied."""
    airports = {}
    for iata, source in raw.items():
        if iata in AIRPORT_MERGES:
            continue
        airport = {
            "iata_code": iata,
            "icao_code": source.get("icao") or None,
            "name": source.get("name") or iata,
            "city": source.get("city_name") or "",
            "country": source.get("country") or "",
            "latitude": parse_coordinate(source.get("latitude")),
            "longitude": parse_coordinate(source.get("longitude")),
        }
        airport.update(AIRPORT_FIXES.get(iata, {}))
        if airport["latitude"] is None or airport["longitude"] is None:
            continue
        airports[iata] = airport
    return airports


def collect_routes(
    raw: dict, airports: dict[str, dict]
) -> tuple[dict[tuple[str, str, str], int | None], dict[str, str]]:
    """Deduplicated (source, destination, carrier) services, plus the carriers."""
    routes: dict[tuple[str, str, str], int | None] = {}
    airlines: dict[str, str] = {}

    for source_iata, source in raw.items():
        # Routes filed under a merged-away code belong to the airport kept.
        source_iata = AIRPORT_MERGES.get(source_iata, source_iata)
        if source_iata not in airports:
            continue
        for route in source.get("routes") or []:
            destination_iata = AIRPORT_MERGES.get(route.get("iata"), route.get("iata"))
            if destination_iata == source_iata or destination_iata not in airports:
                continue
            if frozenset({source_iata, destination_iata}) in BOGUS_ROUTES:
                continue

            duration = route.get("min")
            duration = int(duration) if duration is not None else None

            for carrier in route.get("carriers") or []:
                code = carrier.get("iata")
                if not code:
                    continue
                airlines.setdefault(code, carrier.get("name") or code)
                routes.setdefault((source_iata, destination_iata, code), duration)

    return routes, airlines


def drop_duplicate_icao(airports: list[dict]) -> int:
    """A few airports share an ICAO code, which the column won't allow."""
    seen = set()
    dropped = 0
    for airport in airports:
        icao = airport["icao_code"]
        if icao is None:
            continue
        if icao in seen:
            airport["icao_code"] = None
            dropped += 1
        else:
            seen.add(icao)
    return dropped


def import_routes() -> None:
    if not DATA_FILE.exists():
        sys.exit(
            f"{DATA_FILE} not found. Generate it with "
            "'python backend/data/scrape_airline_routes.py' first."
        )

    print(f"Reading {DATA_FILE}...")
    raw = json.loads(DATA_FILE.read_text())

    airports = collect_airports(raw)
    routes, airlines = collect_routes(raw, airports)

    # An airport earns its place only if something flies out of it or into it.
    connected = {source for source, _, _ in routes} | {
        destination for _, destination, _ in routes
    }
    airport_rows = [airports[iata] for iata in sorted(connected)]
    shared_icao = drop_duplicate_icao(airport_rows)

    airline_rows = [
        {"iata_code": code, "icao_code": None, "name": name}
        for code, name in sorted(airlines.items())
    ]

    db = SessionLocal()
    try:
        print("Wiping existing airports, airlines and routes...")
        db.execute(text("TRUNCATE routes, airlines, airports RESTART IDENTITY CASCADE"))

        db.execute(insert(Airport), airport_rows)
        db.execute(insert(Airline), airline_rows)

        airport_ids = dict(db.execute(select(Airport.iata_code, Airport.id)).all())
        airline_ids = dict(db.execute(select(Airline.iata_code, Airline.id)).all())

        # The scrape carries no schedule, so operating_days stays NULL: unknown.
        db.execute(
            insert(Route),
            [
                {
                    "source_airport_id": airport_ids[source],
                    "destination_airport_id": airport_ids[destination],
                    "airline_id": airline_ids[code],
                    "duration_minutes": duration,
                    "distance_km": great_circle_km(airports[source], airports[destination]),
                }
                for (source, destination, code), duration in routes.items()
            ],
        )

        # Truncating airlines wiped the tags, so they are re-applied every import.
        alliance_problems = assign_alliances(db)

        db.commit()
    finally:
        db.close()

    print(
        f"Imported {len(airport_rows)} airports, {len(airline_rows)} airlines, "
        f"{len(routes)} routes."
    )
    print(
        f"  Skipped {len(raw) - len(airports)} airports without usable coordinates "
        f"and {len(airports) - len(airport_rows)} with no routes in either direction."
    )
    for problem in alliance_problems:
        print(f"  Alliance: {problem}")
    if shared_icao:
        print(f"  Cleared {shared_icao} ICAO codes already claimed by another airport.")


if __name__ == "__main__":
    import_routes()
