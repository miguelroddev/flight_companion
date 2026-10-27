from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.models import Airline, Airport

DayOfWeek = Literal["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
Difficulty = Literal["easy", "medium", "hard"]


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


class ItineraryOut(ApiModel):
    """A way to fly departure -> arrival through one or two other airports."""

    # The stops in flying order, departure and arrival excluded
    via: list[AirportOut]
    # Flying time of each leg, len(via) + 1 of them
    leg_minutes: list[int]
    # Their sum. There are no schedules, so layovers are not included.
    total_minutes: int


class ItinerariesOut(ApiModel):
    # 1 or 2; None when nothing was found within two stops
    stops: Literal[1, 2] | None
    # Fastest first
    itineraries: list[ItineraryOut]


class GamePuzzleOut(ApiModel):
    """A route game to play: get from departure to arrival, which have no
    direct flight between them."""

    difficulty: Difficulty
    # Asking again with this seed and difficulty gives the same puzzle
    seed: int
    # The day it is the daily puzzle of, or None for a random one
    daily: date | None
    departure: AirportOut
    arrival: AirportOut
    max_flights: int


class GameRouteOut(ApiModel):
    # In flying order, departure and arrival included
    airports: list[AirportOut]
    # The distance of each flight, one fewer than there are airports
    leg_km: list[int]
    total_km: int


class GameResultOut(ApiModel):
    route: GameRouteOut
    best: GameRouteOut
    # Out of 1000; 1000 for the best route or one as good
    score: int
