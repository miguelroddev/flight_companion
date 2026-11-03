"""merge airports listed twice, fix misplaced ones

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# app/import_routes.py's AIRPORT_MERGES and AIRPORT_FIXES at the time, copied
# rather than imported so this migration does the same thing whatever those
# become. (merged-away code, code kept)
MERGES = [("PBI", "DJT"), ("MLH", "BSL")]

FIXES = {
    "QJG": {"latitude": 66.57778, "longitude": -53.5},
    "AHA": {
        "icao_code": "VEAP",
        "name": "Maa Mahamaya Airport",
        "city": "Ambikapur",
        "country": "India",
        "latitude": 22.98725,
        "longitude": 83.196139,
    },
}


def execute(sql: str, **params) -> None:
    op.execute(sa.text(sql).bindparams(**params))


def merge(old: str, kept: str) -> None:
    # Only when both are there: with the kept airport missing, the old one's
    # routes would have nowhere to go.
    ids = """
        old.iata_code = :old AND kept.iata_code = :kept
    """
    for moved, other in (
        ("source_airport_id", "destination_airport_id"),
        ("destination_airport_id", "source_airport_id"),
    ):
        # A route the kept airport already has, same other end and airline,
        # would break the unique constraint once moved: it goes instead.
        execute(
            f"""
            DELETE FROM routes
            USING airports AS old, airports AS kept
            WHERE {ids}
              AND routes.{moved} = old.id
              AND EXISTS (
                SELECT 1 FROM routes AS twin
                WHERE twin.{moved} = kept.id
                  AND twin.{other} = routes.{other}
                  AND twin.airline_id = routes.airline_id
              )
            """,
            old=old,
            kept=kept,
        )
        execute(
            f"""
            UPDATE routes SET {moved} = kept.id
            FROM airports AS old, airports AS kept
            WHERE {ids} AND routes.{moved} = old.id
            """,
            old=old,
            kept=kept,
        )
    # A flight between the two codes would now go nowhere.
    op.execute("DELETE FROM routes WHERE source_airport_id = destination_airport_id")
    execute(
        """
        DELETE FROM airports AS old
        WHERE old.iata_code = :old
          AND EXISTS (SELECT 1 FROM airports AS kept WHERE kept.iata_code = :kept)
          AND NOT EXISTS (
            SELECT 1 FROM routes
            WHERE routes.source_airport_id = old.id
               OR routes.destination_airport_id = old.id
          )
        """,
        old=old,
        kept=kept,
    )


def upgrade() -> None:
    for old, kept in MERGES:
        merge(old, kept)

    for iata, fields in FIXES.items():
        assignments = ", ".join(f"{column} = :{column}" for column in fields)
        execute(f"UPDATE airports SET {assignments} WHERE iata_code = :iata", iata=iata, **fields)

    # Distances are stored on each route, from its airports' coordinates:
    # recomputed wherever those changed, with migration 0005's formula.
    touched = sorted({kept for _, kept in MERGES} | set(FIXES))
    op.execute(
        sa.text(
            """
            UPDATE routes
            SET distance_km = round(
                2 * 6371 * asin(least(1, sqrt(
                    power(sin(radians(destination.latitude - source.latitude) / 2), 2)
                    + cos(radians(source.latitude)) * cos(radians(destination.latitude))
                    * power(sin(radians(destination.longitude - source.longitude) / 2), 2)
                )))
            )
            FROM airports AS source, airports AS destination
            WHERE source.id = routes.source_airport_id
              AND destination.id = routes.destination_airport_id
              AND (source.iata_code IN :touched OR destination.iata_code IN :touched)
            """
        ).bindparams(sa.bindparam("touched", value=touched, expanding=True))
    )


def downgrade() -> None:
    # Nothing to put back: the duplicates and wrong places were never real.
    pass
