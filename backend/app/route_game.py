"""The route game: fly from one airport to another with no direct flight
between them, one leg at a time, and be scored against the best route there is.

The best route is the cheapest by a cost of its distance plus a fixed charge
for every flight taken. Distance alone would reward hopping between nearby
airports along the great circle; flights alone would ignore a long detour.
The charge stands in for the time and hassle of each extra connection.

Pure logic over an in-memory network, so it needs no database to run.
"""
import heapq
import math
import random
from collections import deque
from dataclasses import dataclass
from app.schemas import AirportOut, Difficulty

# What each flight costs on top of its distance. A detour of up to this many
# km beats an extra connection.
FLIGHT_COST_KM = 300

# Longest route a player may fly, and so the longest puzzle there can be.
MAX_FLIGHTS = 6

# Routes within this fraction of the best one's cost count as the best: two
# routes can differ by a few km through neighbouring hubs, and rounding the
# distances to whole km should never cost a perfect score.
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

    def cost(self, path: list[str]) -> int:
        """Of a route known to be flyable."""
        return sum(
            self.legs[source][destination] + FLIGHT_COST_KM
            for source, destination in zip(path, path[1:])
        )

    def best_route(self, departure: str, arrival: str) -> list[str] | None:
        """The cheapest route as IATA codes, ends included, by Dijkstra.
        None when the arrival cannot be reached at all.

        Equal costs are settled by the codes along the way, so the answer
        never changes between calls.
        """
        best_cost = {departure: 0}
        previous: dict[str, str] = {}
        queue = [(0, departure)]
        while queue:
            cost, airport = heapq.heappop(queue)
            if airport == arrival:
                break
            if cost > best_cost[airport]:
                continue
            for destination, km in self.legs.get(airport, {}).items():
                next_cost = cost + km + FLIGHT_COST_KM
                if next_cost < best_cost.get(destination, math.inf):
                    best_cost[destination] = next_cost
                    previous[destination] = airport
                    heapq.heappush(queue, (next_cost, destination))
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


def score(best_cost: int, cost: int) -> int:
    """Out of PERFECT_SCORE, in proportion to how close the cost came."""
    if cost <= best_cost * (1 + PERFECT_MARGIN):
        return PERFECT_SCORE
    return round(PERFECT_SCORE * best_cost / cost)
