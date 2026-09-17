"""widen airline iata code to 3 characters

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A handful of carriers in the flightsfrom.com data carry a 3-letter code
    # in the IATA field, e.g. EDC, SQB, CAT.
    op.alter_column(
        "airlines",
        "iata_code",
        existing_type=sa.String(length=2),
        type_=sa.String(length=3),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "airlines",
        "iata_code",
        existing_type=sa.String(length=3),
        type_=sa.String(length=2),
        existing_nullable=True,
    )
