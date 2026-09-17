"""Populate the database with the airports/airlines/routes the frontend
originally had hardcoded in src/data/airports.ts and src/data/routes.ts.

Safe to re-run: rows are upserted on their natural keys, so running it again
updates existing rows instead of duplicating them.

Run with: docker compose exec backend python -m app.seed
"""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import Airline, Airport, Route

# The frontend didn't track country/ICAO, so those were filled in here to
# satisfy the backend schema.
AIRPORTS = [
    {"iata": "LIS", "icao": "LPPT", "name": "Humberto Delgado Airport", "city": "Lisbon", "country": "Portugal", "lat": 38.7813, "lng": -9.1359},
    {"iata": "MUC", "icao": "EDDM", "name": "Munich Airport", "city": "Munich", "country": "Germany", "lat": 48.3538, "lng": 11.7861},
    {"iata": "LHR", "icao": "EGLL", "name": "Heathrow Airport", "city": "London", "country": "United Kingdom", "lat": 51.4700, "lng": -0.4543},
    {"iata": "FRA", "icao": "EDDF", "name": "Frankfurt Airport", "city": "Frankfurt", "country": "Germany", "lat": 50.0379, "lng": 8.5622},
    {"iata": "PEK", "icao": "ZBAA", "name": "Beijing Capital International Airport", "city": "Beijing", "country": "China", "lat": 40.0799, "lng": 116.6031},
    {"iata": "SFO", "icao": "KSFO", "name": "San Francisco International Airport", "city": "San Francisco", "country": "United States", "lat": 37.6213, "lng": -122.3790},
    {"iata": "BSB", "icao": "SBBR", "name": "Presidente Juscelino Kubitschek International Airport", "city": "Brasília", "country": "Brazil", "lat": -15.8697, "lng": -47.9172},
    {"iata": "CPT", "icao": "FACT", "name": "Cape Town International Airport", "city": "Cape Town", "country": "South Africa", "lat": -33.9715, "lng": 18.6021},
    {"iata": "SYD", "icao": "YSSY", "name": "Sydney Kingsford Smith Airport", "city": "Sydney", "country": "Australia", "lat": -33.9399, "lng": 151.1753},
    {"iata": "HND", "icao": "RJTT", "name": "Tokyo Haneda Airport", "city": "Tokyo", "country": "Japan", "lat": 35.5494, "lng": 139.7798},
    {"iata": "WAW", "icao": "EPWA", "name": "Warsaw Chopin Airport", "city": "Warsaw", "country": "Poland", "lat": 52.1657, "lng": 20.9671},
    {"iata": "ALA", "icao": "UAAA", "name": "Almaty International Airport", "city": "Almaty", "country": "Kazakhstan", "lat": 43.3521, "lng": 77.0405},
]

# Names must match the keys in src/features/route/airlineIcons.ts
AIRLINES = [
    {"iata": "TP", "icao": "TAP", "name": "TAP Air Portugal"},
    {"iata": "BA", "icao": "BAW", "name": "British Airways"},
    {"iata": "LH", "icao": "DLH", "name": "Lufthansa"},
    {"iata": "CA", "icao": "CCA", "name": "Air China"},
    {"iata": "QF", "icao": "QFA", "name": "Qantas"},
    {"iata": "CZ", "icao": "CSN", "name": "China Southern"},
    {"iata": "NH", "icao": "ANA", "name": "All Nippon Airways"},
    {"iata": "KC", "icao": "KZR", "name": "Air Astana"},
]

DAILY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"]

# (departure, arrival, airline, duration_minutes, operating_days)
# operating_days=None means the schedule is unknown.
ROUTES = [
    ("LIS", "LHR", "TP", 155, DAILY),
    ("LIS", "LHR", "BA", 155, ["fri", "sat", "sun"]),
    ("LIS", "FRA", "LH", 175, DAILY),
    ("MUC", "LHR", "LH", 115, WEEKDAYS),
    ("MUC", "FRA", "LH", 65, DAILY),
    ("FRA", "LHR", "BA", 95, None),
    ("FRA", "LHR", "LH", 95, ["mon", "wed", "fri"]),
    ("LIS", "PEK", "CA", 705, ["tue", "thu", "sat"]),
    ("MUC", "PEK", "CA", 610, DAILY),
    ("MUC", "SFO", "LH", 700, DAILY),
    ("LHR", "SFO", "BA", 650, DAILY),
    ("LIS", "BSB", "TP", 580, ["mon", "wed", "fri", "sun"]),
    ("BSB", "LIS", "TP", 560, ["mon", "wed", "fri", "sun"]),
    ("LHR", "CPT", "BA", 710, DAILY),
    ("CPT", "LHR", "BA", 690, DAILY),
    ("FRA", "CPT", "LH", 680, ["tue", "thu", "sat", "sun"]),
    ("LHR", "SYD", "QF", 1310, DAILY),
    ("SYD", "LHR", "QF", 1290, DAILY),
    ("PEK", "SYD", "CZ", 665, ["mon", "thu", "sat"]),
    ("SFO", "HND", "NH", 635, DAILY),
    ("HND", "SFO", "NH", 590, DAILY),
    ("FRA", "HND", "LH", 705, ["mon", "tue", "thu", "fri", "sun"]),
    ("MUC", "WAW", "LH", 110, WEEKDAYS),
    ("WAW", "MUC", "LH", 115, WEEKDAYS),
    ("WAW", "ALA", "KC", 385, ["mon", "wed", "fri", "sun"]),
    ("ALA", "WAW", "KC", 370, ["mon", "wed", "fri", "sun"]),
]


def upsert(db, model, rows, conflict_columns):
    statement = insert(model).values(rows)
    update_columns = {
        column: statement.excluded[column]
        for column in rows[0]
        if column not in conflict_columns
    }
    db.execute(
        statement.on_conflict_do_update(index_elements=conflict_columns, set_=update_columns)
    )


def seed() -> None:
    db = SessionLocal()
    try:
        upsert(
            db,
            Airport,
            [
                {
                    "iata_code": a["iata"],
                    "icao_code": a["icao"],
                    "name": a["name"],
                    "city": a["city"],
                    "country": a["country"],
                    "latitude": a["lat"],
                    "longitude": a["lng"],
                }
                for a in AIRPORTS
            ],
            ["iata_code"],
        )
        upsert(
            db,
            Airline,
            [{"iata_code": a["iata"], "icao_code": a["icao"], "name": a["name"]} for a in AIRLINES],
            ["iata_code"],
        )

        airport_ids = dict(db.execute(select(Airport.iata_code, Airport.id)).all())
        airline_ids = dict(db.execute(select(Airline.iata_code, Airline.id)).all())

        upsert(
            db,
            Route,
            [
                {
                    "source_airport_id": airport_ids[source],
                    "destination_airport_id": airport_ids[destination],
                    "airline_id": airline_ids[airline],
                    "duration_minutes": duration,
                    "operating_days": days,
                }
                for source, destination, airline, duration, days in ROUTES
            ],
            ["source_airport_id", "destination_airport_id", "airline_id"],
        )

        db.commit()
        print(
            f"Seeded {len(AIRPORTS)} airports, {len(AIRLINES)} airlines, "
            f"{len(ROUTES)} routes."
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed()
