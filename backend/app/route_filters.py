"""The route filters the map offers, shared by every endpoint that lists
airports or routes.

A route row must satisfy every filter in use; within the alliance and airline
filters, any of the picked options will do. Distance and duration are
inclusive ranges, and either end may be left open. A route with no known
duration fails any duration bound.
"""
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy import ColumnElement, Select, select

from app.alliances import Alliance
from app.models import Airline, Route


@dataclass(frozen=True)
class RouteFilters:
    alliances: list[Alliance]
    # IATA codes
    airlines: list[str]
    min_distance_km: int | None = None
    max_distance_km: int | None = None
    min_duration_minutes: int | None = None
    max_duration_minutes: int | None = None

    def conditions(self) -> list[ColumnElement[bool]]:
        """Conditions on Route; empty when nothing is filtered."""
        conditions = []
        if self.alliances:
            conditions.append(
                Route.airline_id.in_(
                    select(Airline.id).where(Airline.alliance.in_(self.alliances))
                )
            )

        if self.airlines:
            conditions.append(
                Route.airline_id.in_(
                    select(Airline.id).where(Airline.iata_code.in_(self.airlines))
                )
            )

        bounds = (
            (Route.distance_km, self.min_distance_km, self.max_distance_km),
            (Route.duration_minutes, self.min_duration_minutes, self.max_duration_minutes),
        )
        for column, low, high in bounds:
            if low is not None:
                conditions.append(column >= low)
            if high is not None:
                conditions.append(column <= high)
        return conditions

    def apply(self, statement: Select) -> Select:
        """The statement, narrowed to matching routes. It must select from or
        join Route."""
        conditions = self.conditions()
        return statement.where(*conditions) if conditions else statement


def route_filters(
    # Repeatable, e.g. ?alliance=oneworld&alliance=skyteam.
    alliance: Annotated[list[Alliance] | None, Query()] = None,
    airline: Annotated[list[str] | None, Query(description="IATA code")] = None,
    min_distance: Annotated[int | None, Query(ge=0, description="km")] = None,
    max_distance: Annotated[int | None, Query(ge=0, description="km")] = None,
    min_duration: Annotated[int | None, Query(ge=0, description="minutes")] = None,
    max_duration: Annotated[int | None, Query(ge=0, description="minutes")] = None,
) -> RouteFilters:
    return RouteFilters(
        alliances=alliance or [],
        airlines=[code.upper() for code in airline or []],
        min_distance_km=min_distance,
        max_distance_km=max_distance,
        min_duration_minutes=min_duration,
        max_duration_minutes=max_duration,
    )


RouteFilterParams = Annotated[RouteFilters, Depends(route_filters)]
