"""Print every airline that actually operates a route, as JSON on stdout.

Intended for handing off to something that resolves a logo per airline; the
frontend keys src/features/route/airlineIcons.ts by the exact name printed here.

Run with:
    docker compose exec backend python -m app.export_airlines > airlines.json
"""
import json

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Airline, Route


def export_airlines() -> list[dict]:
    db = SessionLocal()
    try:
        rows = db.execute(
            select(Airline.iata_code, Airline.name)
            .join(Route, Route.airline_id == Airline.id)
            .distinct()
            .order_by(Airline.name)
        ).all()
    finally:
        db.close()

    return [{"iata": iata, "name": name} for iata, name in rows]


if __name__ == "__main__":
    print(json.dumps(export_airlines(), indent=2, ensure_ascii=False))
