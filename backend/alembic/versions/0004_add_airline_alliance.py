"""add airline alliance

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema only. The membership itself lives in app/alliances.py and is
    # written by "python -m app.alliances", which deploys run after migrating.
    op.add_column("airlines", sa.Column("alliance", sa.String(length=16), nullable=True))
    op.create_index("ix_airlines_alliance", "airlines", ["alliance"])
    op.create_check_constraint(
        "ck_airlines_alliance",
        "airlines",
        "alliance IN ('star_alliance', 'oneworld', 'skyteam')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_airlines_alliance", "airlines", type_="check")
    op.drop_index("ix_airlines_alliance", table_name="airlines")
    op.drop_column("airlines", "alliance")
