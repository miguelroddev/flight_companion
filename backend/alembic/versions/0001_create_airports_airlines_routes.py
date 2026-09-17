"""create airports, airlines, routes

Revision ID: 0001
Revises:
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "airports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("iata_code", sa.String(length=3), nullable=False),
        sa.Column("icao_code", sa.String(length=4), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("country", sa.String(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
    )
    op.create_index("ix_airports_iata_code", "airports", ["iata_code"], unique=True)
    op.create_index("ix_airports_icao_code", "airports", ["icao_code"], unique=True)

    op.create_table(
        "airlines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("iata_code", sa.String(length=2), nullable=True),
        sa.Column("icao_code", sa.String(length=3), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
    )
    op.create_index("ix_airlines_iata_code", "airlines", ["iata_code"], unique=True)
    op.create_index("ix_airlines_icao_code", "airlines", ["icao_code"], unique=True)

    op.create_table(
        "routes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "source_airport_id",
            sa.Integer(),
            sa.ForeignKey("airports.id"),
            nullable=False,
        ),
        sa.Column(
            "destination_airport_id",
            sa.Integer(),
            sa.ForeignKey("airports.id"),
            nullable=False,
        ),
        sa.Column(
            "airline_id", sa.Integer(), sa.ForeignKey("airlines.id"), nullable=False
        ),
    )
    op.create_index("ix_routes_source_airport_id", "routes", ["source_airport_id"])
    op.create_index(
        "ix_routes_destination_airport_id", "routes", ["destination_airport_id"]
    )
    op.create_index("ix_routes_airline_id", "routes", ["airline_id"])


def downgrade() -> None:
    op.drop_table("routes")
    op.drop_table("airlines")
    op.drop_table("airports")
