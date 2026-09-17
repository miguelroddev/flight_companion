from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.models import Airline, Airport

DayOfWeek = Literal["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class AirportOut(ApiModel):
    iata: str
    icao: str | None
    name: str
    city: str
    country: str
    lat: float
    lng: float

    @classmethod
    def from_model(cls, airport: Airport) -> "AirportOut":
        return cls(
            iata=airport.iata_code,
            icao=airport.icao_code,
            name=airport.name,
            city=airport.city,
            country=airport.country,
            lat=airport.latitude,
            lng=airport.longitude,
        )


class AirlineOut(ApiModel):
    iata: str | None
    icao: str | None
    name: str

    @classmethod
    def from_model(cls, airline: Airline) -> "AirlineOut":
        return cls(iata=airline.iata_code, icao=airline.icao_code, name=airline.name)


class AirlineServiceOut(ApiModel):
    airline: AirlineOut
    # None means the schedule is unknown, [] means it operates on no days
    operating_days: list[DayOfWeek] | None


class RouteOut(ApiModel):
    departure: AirportOut
    arrival: AirportOut
    duration_minutes: int | None
    services: list[AirlineServiceOut]
