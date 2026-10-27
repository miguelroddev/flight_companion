"""The route game: fly from one airport to another with no direct flight
between them, one leg at a time, and be scored against the best route there is.

The best route is the one with the fewest flights, and of those the shortest
by distance. Flights come first: every extra connection is time and hassle
that a shorter way cannot make up for, so distance only settles between
routes with as many flights.

Pure logic over an in-memory network, so it needs no database to run.
"""
import heapq
import math
import random
from collections import deque
from dataclasses import dataclass
from app.schemas import AirportOut, Difficulty

# What routes are compared by: (flights, km). Tuples compare in order, so
# fewer flights always wins and distance only breaks a tie.
Measure = tuple[int, int]

# Taken off the score for every flight more than the best route takes.
FLIGHT_PENALTY = 150

# Longest route a player may fly, and so the longest puzzle there can be.
MAX_FLIGHTS = 6

# Routes with as many flights as the best one, and within this fraction of
# its distance, count as the best: two routes can differ by a few km through
# neighbouring hubs, and rounding the distances to whole km should never cost
# a perfect score.
PERFECT_MARGIN = 0.005

PERFECT_SCORE = 1000


@dataclass(frozen=True)
class PuzzleRules:
    # Both ends of the puzzle are airports with this many outbound route rows,
    # the same measure the map sizes its pins by.
    min_routes: int
    max_routes: int
    # The fewest flights the trip can be made in, whatever their cost.
    min_flights: int
    max_flights: int
    # Straight-line distance between the ends: close pairs make dull puzzles.
    min_km: int


DIFFICULTIES: dict[Difficulty, PuzzleRules] = {
    # Hub to hub, one stop away.
    "easy": PuzzleRules(min_routes=100, max_routes=10_000, min_flights=2, max_flights=2, min_km=1500),
    "medium": PuzzleRules(min_routes=25, max_routes=10_000, min_flights=2, max_flights=3, min_km=2500),
    # Regional airports, at least two stops apart.
    "hard": PuzzleRules(min_routes=8, max_routes=24, min_flights=3, max_flights=4, min_km=3000),
}

# Tries at a departure with a destination that fits the rules before giving up.
PUZZLE_ATTEMPTS = 100


def great_circle_km(a: AirportOut, b: AirportOut) -> int:
    """Haversine distance, as import_routes stores it on every route."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    d_lat = lat2 - lat1
    d_lng = math.radians(b.lng - a.lng)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(h)))


class RouteGraph:
    """Every airport and every airport pair flown, in one direction each."""

    def __init__(self, airports: dict[str, AirportOut], legs: dict[str, dict[str, int]]):
        # By IATA code
        self.airports = airports
        # Source IATA -> destination IATA -> km
        self.legs = legs

    def leg_km(self, source: str, destination: str) -> int | None:
        """The distance of the flight, or None when there is no such flight."""
        return self.legs.get(source, {}).get(destination)

    def measure(self, path: list[str]) -> Measure:
        """The flights and km of a route known to be flyable."""
        km = sum(self.legs[source][destination] for source, destination in zip(path, path[1:]))
        return len(path) - 1, km

    def best_route(self, departure: str, arrival: str) -> list[str] | None:
        """The best route as IATA codes, ends included: the fewest flights,
        then the shortest distance. Dijkstra over (flights, km), which add up
        leg by leg and compare in that order.
        None when the arrival cannot be reached at all.

        Equal routes are settled by the codes along the way, so the answer
        never changes between calls.
        """
        best: dict[str, Measure] = {departure: (0, 0)}
        previous: dict[str, str] = {}
        queue: list[tuple[int, int, str]] = [(0, 0, departure)]
        while queue:
            flights, km, airport = heapq.heappop(queue)
            if airport == arrival:
                break
            if (flights, km) > best[airport]:
                continue
            for destination, leg_km in self.legs.get(airport, {}).items():
                reached = (flights + 1, km + leg_km)
                if destination not in best or reached < best[destination]:
                    best[destination] = reached
                    previous[destination] = airport
                    heapq.heappush(queue, (*reached, destination))
        else:
            return None

        path = [arrival]
        while path[-1] != departure:
            path.append(previous[path[-1]])
        return path[::-1]

    def flights_from(self, departure: str, limit: int) -> dict[str, int]:
        """The fewest flights to every airport reachable from the departure
        in at most limit of them, by breadth-first search."""
        flights = {departure: 0}
        queue = deque([departure])
        while queue:
            airport = queue.popleft()
            if flights[airport] == limit:
                continue
            for destination in self.legs.get(airport, {}):
                if destination not in flights:
                    flights[destination] = flights[airport] + 1
                    queue.append(destination)
        return flights

    def make_puzzle(self, difficulty: Difficulty, seed: int) -> tuple[str, str]:
        """A departure and an arrival fitting the difficulty's rules. The same
        seed always gives the same pair, as long as the network is unchanged.

        Raises LookupError if no pair fits, which only an almost empty
        network would do.
        """
        rules = DIFFICULTIES[difficulty]
        # Sorted, so the choices below depend on the seed alone.
        pool = sorted(
            iata
            for iata, airport in self.airports.items()
            if rules.min_routes <= airport.route_count <= rules.max_routes and iata in self.legs
        )
        in_pool = set(pool)
        # A string seed hashes the same in every process, unlike str's hash().
        rng = random.Random(f"{difficulty}:{seed}")

        for _ in range(PUZZLE_ATTEMPTS if pool else 0):
            departure = rng.choice(pool)
            flights = self.flights_from(departure, rules.max_flights)
            arrivals = sorted(
                iata
                for iata, count in flights.items()
                if rules.min_flights <= count and iata in in_pool
                and great_circle_km(self.airports[departure], self.airports[iata]) >= rules.min_km
            )
            if arrivals:
                return departure, rng.choice(arrivals)
        raise LookupError(f"No {difficulty} puzzle fits this network")


def score(best: Measure, route: Measure) -> int:
    """Out of PERFECT_SCORE: in proportion to how close the distance came,
    less FLIGHT_PENALTY for every flight more than the best route takes.

    A route with more flights can be shorter than the best one, but being
    shorter never makes up for a flight: its distance then scores in full,
    and the extra flights still cost what they cost.
    """
    best_flights, best_km = best
    flights, km = route
    if km <= best_km * (1 + PERFECT_MARGIN):
        distance_score = PERFECT_SCORE
    else:
        distance_score = round(PERFECT_SCORE * best_km / km)
    extra_flights = max(0, flights - best_flights)
    return max(0, distance_score - extra_flights * FLIGHT_PENALTY)
