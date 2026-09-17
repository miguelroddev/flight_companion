"""add route duration, operating days and uniqueness

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("routes", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    op.add_column(
        "routes",
        sa.Column("operating_days", sa.ARRAY(sa.String(length=3)), nullable=True),
    )
    op.create_unique_constraint(
        "uq_routes_source_destination_airline",
        "routes",
        ["source_airport_id", "destination_airport_id", "airline_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_routes_source_destination_airline", "routes", type_="unique")
    op.drop_column("routes", "operating_days")
    op.drop_column("routes", "duration_minutes")
