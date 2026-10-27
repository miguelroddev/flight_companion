import type { Difficulty, GamePuzzle, GameRoute } from "../../api/flights";

// Mirrors backend/app/route_game.py, which does the scoring itself; these are
// only for telling the player the rules.
export const PERFECT_SCORE = 1000;
export const FLIGHT_COST_KM = 300;

// Played without hints, each flight tried that does not exist costs this
// much off the route's score.
export const MISS_PENALTY = 50;

// In order, so a difficulty's position is its level, 1 to 3.
export const DIFFICULTIES: readonly { id: Difficulty; label: string; description: string }[] = [
  { id: "easy", label: "Easy", description: "Hub to hub" },
  { id: "medium", label: "Medium", description: "1–2 stops" },
  { id: "hard", label: "Hard", description: "Small airports" },
];

export function difficultyLevel(difficulty: Difficulty): number {
  return DIFFICULTIES.findIndex((option) => option.id === difficulty) + 1;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTIES.find((option) => option.id === difficulty)?.label ?? difficulty;
}

// The points for the game: the route's score, less the misses.
export function finalScore(routeScore: number, misses: number): number {
  return Math.max(0, routeScore - misses * MISS_PENALTY);
}

// Stars and verdict judge the route alone, never the misses: they say how
// good the route found was, the points how cleanly it was found.
// 3 for the best route, 2 for a route within reach of it, 1 for getting there.
// 850 is a route costing up to ~18% more than the best: a fair detour still
// earns two, so one star means a clearly roundabout way.
export const TWO_STAR_SCORE = 850;

export function starCount(routeScore: number): number {
  if (routeScore >= PERFECT_SCORE) return 3;
  if (routeScore >= TWO_STAR_SCORE) return 2;
  return 1;
}

export function verdict(routeScore: number): string {
  if (routeScore >= PERFECT_SCORE) return "Perfect route!";
  if (routeScore >= 980) return "So close!";
  if (routeScore >= 920) return "Great route";
  if (routeScore >= TWO_STAR_SCORE) return "Good route";
  return "You made it";
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

// One sentence on where the route lost to the best one, in the game's own
// terms: flights and kilometres.
export function comparison(route: GameRoute, best: GameRoute, routeScore: number): string {
  const sameAirports =
    route.airports.map((airport) => airport.iata).join() ===
    best.airports.map((airport) => airport.iata).join();
  if (sameAirports) return "You found the best route.";
  if (routeScore >= PERFECT_SCORE) return "As good as the best route: well found.";

  const extraFlights = route.legKm.length - best.legKm.length;
  const extraKm = route.totalKm - best.totalKm;
  const longer = `${formatKm(Math.abs(extraKm))} ${extraKm >= 0 ? "longer" : "shorter"}`;

  if (extraFlights === 0) return `Same number of flights as the best route, but ${longer}.`;
  if (extraFlights > 0 && extraKm < 0) {
    return `${longer}, but ${plural(extraFlights, "flight")} more, and each costs ${FLIGHT_COST_KM} km.`;
  }
  if (extraFlights > 0) return `${plural(extraFlights, "flight")} more and ${longer} than the best route.`;
  return `${plural(-extraFlights, "flight")} fewer, but ${longer} than the best route.`;
}

// "Oct 27", for a UTC date (YYYY-MM-DD) or today.
export function shortDate(date?: string): string {
  return new Date(date ? `${date}T00:00:00Z` : Date.now()).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Daily · Oct 27" or "Random".
export function puzzleKind(puzzle: GamePuzzle): string {
  return puzzle.daily ? `Daily · ${shortDate(puzzle.daily)}` : "Random";
}

// "Daily · Oct 27 · Easy"
export function puzzleLabel(puzzle: GamePuzzle): string {
  return `${puzzleKind(puzzle)} · ${difficultyLabel(puzzle.difficulty)}`;
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

export function flightCount(flights: number): string {
  return `${flights} ${flights === 1 ? "flight" : "flights"}`;
}

// Where the same puzzle can be played again, the daily one included.
export function puzzleUrl(puzzle: GamePuzzle): string {
  const params = new URLSearchParams({
    difficulty: puzzle.difficulty,
    seed: String(puzzle.seed),
  });
  return `${window.location.origin}/play?${params}`;
}

// What the Share button copies: the result without giving the route away.
export function shareText(
  puzzle: GamePuzzle,
  route: GameRoute,
  routeScore: number,
  misses: number,
): string {
  const stars = starCount(routeScore);
  return [
    `Flight Companion route game · ${puzzleLabel(puzzle)}`,
    `${puzzle.departure.iata} → ${puzzle.arrival.iata}`,
    `${"✈️".repeat(route.legKm.length)} ${flightCount(route.legKm.length)} · ${formatKm(route.totalKm)}`,
    `${"★".repeat(stars)}${"☆".repeat(3 - stars)} ${finalScore(routeScore, misses)}/${PERFECT_SCORE}`,
    puzzleUrl(puzzle),
  ].join("\n");
}
