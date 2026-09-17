from sqlalchemy import Float, ForeignKey, String
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

    id: Mapped[int] = mapped_column(primary_key=True)
    iata_code: Mapped[str | None] = mapped_column(String(2), unique=True, index=True)
    icao_code: Mapped[str | None] = mapped_column(String(3), unique=True, index=True)
    name: Mapped[str] = mapped_column(String)


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_airport_id: Mapped[int] = mapped_column(ForeignKey("airports.id"), index=True)
    destination_airport_id: Mapped[int] = mapped_column(ForeignKey("airports.id"), index=True)
    airline_id: Mapped[int] = mapped_column(ForeignKey("airlines.id"), index=True)

    source_airport: Mapped["Airport"] = relationship(foreign_keys=[source_airport_id])
    destination_airport: Mapped["Airport"] = relationship(foreign_keys=[destination_airport_id])
    airline: Mapped["Airline"] = relationship()
