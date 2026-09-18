"""add route distance

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("routes", sa.Column("distance_km", sa.Integer(), nullable=True))

    # Backfilled from the airports' own coordinates, with the same haversine
    # formula app/import_routes.py uses for fresh imports. least() guards asin
    # against floating-point overshoot past 1 for near-antipodal pairs.
    op.execute(
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
        """
    )


def downgrade() -> None:
    op.drop_column("routes", "distance_km")
