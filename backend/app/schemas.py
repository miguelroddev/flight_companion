from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.models import Airline, Airport

DayOfWeek = Literal["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class AirportOut(ApiModel):
    # Deliberately lean: /airports returns every airport in the dataset, so each
    # field costs ~3.7k copies. Only what the map and the search box render.
    iata: str
    name: str
    city: str
    lat: float
    lng: float
    # Outbound route rows (one per airline per destination); the map sizes and
    # colours each pin by it.
    route_count: int

    @classmethod
    def from_model(cls, airport: Airport, route_count: int) -> "AirportOut":
        return cls(
            iata=airport.iata_code,
            name=airport.name,
            city=airport.city,
            lat=airport.latitude,
            lng=airport.longitude,
            route_count=route_count,
        )


class AirlineOut(ApiModel):
    iata: str | None
    icao: str | None
    name: str
    # star_alliance, oneworld, skyteam, or None for unaligned carriers
    alliance: str | None

    @classmethod
    def from_model(cls, airline: Airline) -> "AirlineOut":
        return cls(
            iata=airline.iata_code,
            icao=airline.icao_code,
            name=airline.name,
            alliance=airline.alliance,
        )


class AirlineServiceOut(ApiModel):
    airline: AirlineOut
    # None means the schedule is unknown, [] means it operates on no days
    operating_days: list[DayOfWeek] | None


class RouteOut(ApiModel):
    departure: AirportOut
    arrival: AirportOut
    duration_minutes: int | None
    services: list[AirlineServiceOut]
