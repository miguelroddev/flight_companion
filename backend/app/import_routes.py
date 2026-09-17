"""Wipe the airports/airlines/routes tables and repopulate them from
backend/data/airline_routes.json.

Generate that file first with:
    python backend/data/scrape_airline_routes.py

Run with: docker compose exec backend python -m app.import_routes
"""
import json
import sys
from pathlib import Path

from sqlalchemy import insert, select, text

from app.database import SessionLocal
from app.models import Airline, Airport, Route

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "airline_routes.json"


def parse_coordinate(value: object) -> float | None:
    """The scrape occasionally yields null, or a stray trailing comma."""
    if value is None:
        return None
    try:
        return float(str(value).split(",")[0])
    except ValueError:
        return None


def collect_airports(raw: dict) -> dict[str, dict]:
    """Airports usable as a map pin, keyed by IATA."""
    airports = {}
    for iata, source in raw.items():
        latitude = parse_coordinate(source.get("latitude"))
        longitude = parse_coordinate(source.get("longitude"))
        if latitude is None or longitude is None:
            continue
        airports[iata] = {
            "iata_code": iata,
            "icao_code": source.get("icao") or None,
            "name": source.get("name") or iata,
            "city": source.get("city_name") or "",
            "country": source.get("country") or "",
            "latitude": latitude,
            "longitude": longitude,
        }
    return airports


def collect_routes(
    raw: dict, airports: dict[str, dict]
) -> tuple[dict[tuple[str, str, str], int | None], dict[str, str]]:
    """Deduplicated (source, destination, carrier) services, plus the carriers."""
    routes: dict[tuple[str, str, str], int | None] = {}
    airlines: dict[str, str] = {}

    for source_iata, source in raw.items():
        if source_iata not in airports:
            continue
        for route in source.get("routes") or []:
            destination_iata = route.get("iata")
            if destination_iata == source_iata or destination_iata not in airports:
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
                }
                for (source, destination, code), duration in routes.items()
            ],
        )

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
    if shared_icao:
        print(f"  Cleared {shared_icao} ICAO codes already claimed by another airport.")


if __name__ == "__main__":
    import_routes()
