export type Airport = {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  // Outbound route rows: one per airline per destination.
  routeCount: number;
};

export type Airline = {
  iata: string | null;
  icao: string | null;
  name: string;
  alliance: Alliance | null;
};

export type DayOfWeek = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export type AirlineService = {
  airline: Airline;
  // null means "not available" (schedule unknown/not published), distinct
  // from [] which would mean the airline is known to operate zero days.
  operatingDays: DayOfWeek[] | null;
};

// A route only connects departure -> arrival in one direction; the reverse
// direction is a separate route.
export type Route = {
  departure: Airport;
  arrival: Airport;
  durationMinutes: number | null;
  services: AirlineService[];
};

export type RouteDirection = "outbound" | "inbound";

export type Alliance = "star_alliance" | "oneworld" | "skyteam";

export const ALLIANCES: readonly { id: Alliance; label: string }[] = [
  { id: "star_alliance", label: "Star Alliance" },
  { id: "oneworld", label: "oneworld" },
  { id: "skyteam", label: "SkyTeam" },
];

// Inclusive on both ends.
export type NumberRange = { min: number; max: number };

// A range whose upper end may be open: { min: 1500, max: null } is 1,500 and up.
export type OpenRange = { min: number; max: number | null };

// What the map is narrowed to. A route must match every filter in use, and
// any of the alliances picked. Empty or null means unfiltered.
export type RouteFilters = {
  alliances: readonly Alliance[];
  // IATA codes
  airlines: readonly string[];
  distanceKm: OpenRange | null;
  durationMinutes: OpenRange | null;
};

export const NO_FILTERS: RouteFilters = {
  alliances: [],
  airlines: [],
  distanceKm: null,
  durationMinutes: null,
};

function appendFilters(params: URLSearchParams, filters: RouteFilters) {
  for (const alliance of filters.alliances) params.append("alliance", alliance);
  for (const airline of filters.airlines) params.append("airline", airline);
  const ranges = [
    ["distance", filters.distanceKm],
    ["duration", filters.durationMinutes],
  ] as const;
  for (const [name, range] of ranges) {
    if (!range) continue;
    if (range.min > 0) params.set(`min_${name}`, String(range.min));
    if (range.max !== null) params.set(`max_${name}`, String(range.max));
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// The list never changes while the app is open, so it is fetched once and
// shared; a failed fetch is forgotten so the next caller can retry.
let airlinesRequest: Promise<Airline[]> | null = null;

export function fetchAirlines(): Promise<Airline[]> {
  airlinesRequest ??= getJson<Airline[]>("/api/airlines").catch((error) => {
    airlinesRequest = null;
    throw error;
  });
  return airlinesRequest;
}

export function fetchAirports(
  filters: RouteFilters,
  signal?: AbortSignal,
): Promise<Airport[]> {
  const params = appendFilters(new URLSearchParams(), filters);
  return getJson(withQuery("/api/airports", params), signal);
}

export function fetchConnectedAirports(
  iata: string,
  direction: RouteDirection,
  filters: RouteFilters,
  signal?: AbortSignal,
): Promise<Airport[]> {
  const params = appendFilters(new URLSearchParams({ direction }), filters);
  return getJson(
    `/api/airports/${encodeURIComponent(iata)}/routes?${params}`,
    signal,
  );
}

// Airport pairs flown by the filtered airlines, one per pair whichever way
// it is flown. Empty unless an airline filter is set.
export function fetchNetwork(
  filters: RouteFilters,
  signal?: AbortSignal,
): Promise<[string, string][]> {
  const params = appendFilters(new URLSearchParams(), filters);
  return getJson(withQuery("/api/network", params), signal);
}

// Resolves to null when no route exists between the two airports.
export async function fetchRoute(
  fromIata: string,
  toIata: string,
  filters: RouteFilters,
  signal?: AbortSignal,
): Promise<Route | null> {
  const params = appendFilters(
    new URLSearchParams({ from: fromIata, to: toIata }),
    filters,
  );
  try {
    return await getJson<Route>(`/api/routes?${params}`, signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
