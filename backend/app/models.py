from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Airport(Base):
    __tablename__ = "airports"

    id: Mapped[int] = mapped_column(primary_key=True)
    iata_code: Mapped[str] = mapped_column(String(3), unique=True, index=True)
    icao_code: Mapped[str | None] = mapped_column(String(4), unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    city: Mapped[str] = mapped_column(String)
    country: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)


class Airline(Base):
    __tablename__ = "airlines"
    __table_args__ = (
        CheckConstraint(
            "alliance IN ('star_alliance', 'oneworld', 'skyteam')",
            name="ck_airlines_alliance",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    iata_code: Mapped[str | None] = mapped_column(String(3), unique=True, index=True)
    icao_code: Mapped[str | None] = mapped_column(String(3), unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    # NULL for unaligned carriers; populated from app/alliances.py
    alliance: Mapped[str | None] = mapped_column(String(16), index=True)


class Route(Base):
    """One airline's service between two airports, in one direction."""

    __tablename__ = "routes"
    __table_args__ = (
        UniqueConstraint(
            "source_airport_id",
            "destination_airport_id",
            "airline_id",
            name="uq_routes_source_destination_airline",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_airport_id: Mapped[int] = mapped_column(ForeignKey("airports.id"), index=True)
    destination_airport_id: Mapped[int] = mapped_column(ForeignKey("airports.id"), index=True)
    airline_id: Mapped[int] = mapped_column(ForeignKey("airlines.id"), index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    # Great-circle distance between the two airports. Per airport pair, so
    # repeated on each airline's row; stored rather than computed per query
    # so the distance filter is a plain comparison.
    distance_km: Mapped[int | None] = mapped_column(Integer)
    # NULL means the schedule is unknown, as opposed to an empty list
    operating_days: Mapped[list[str] | None] = mapped_column(ARRAY(String(3)))

    source_airport: Mapped["Airport"] = relationship(foreign_keys=[source_airport_id])
    destination_airport: Mapped["Airport"] = relationship(foreign_keys=[destination_airport_id])
    airline: Mapped["Airline"] = relationship()
