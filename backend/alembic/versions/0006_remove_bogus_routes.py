"""remove routes no airline flies

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The pairs in app/import_routes.py's BOGUS_ROUTES at the time, copied rather
# than imported so this migration does the same thing whatever that list
# becomes. Both directions of each go.
PAIRS = [("KSQ", "REZ")]


def upgrade() -> None:
    for one, other in PAIRS:
        op.execute(
            sa.text(
                """
                DELETE FROM routes
                USING airports AS source, airports AS destination
                WHERE source.id = routes.source_airport_id
                  AND destination.id = routes.destination_airport_id
                  AND (
                    (source.iata_code = :one AND destination.iata_code = :other)
                    OR (source.iata_code = :other AND destination.iata_code = :one)
                  )
                """
            ).bindparams(one=one, other=other)
        )
        # An airport left with no routes either way would be a pin nothing
        # flies to, which an import never keeps either.
        op.execute(
            sa.text(
                """
                DELETE FROM airports
                WHERE iata_code IN (:one, :other)
                  AND NOT EXISTS (
                    SELECT 1 FROM routes
                    WHERE routes.source_airport_id = airports.id
                       OR routes.destination_airport_id = airports.id
                  )
                """
            ).bindparams(one=one, other=other)
        )


def downgrade() -> None:
    # Nothing to put back: the routes were never real.
    pass
