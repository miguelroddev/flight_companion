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

export function fetchAirports(signal?: AbortSignal): Promise<Airport[]> {
  return getJson("/api/airports", signal);
}

export function fetchConnectedAirports(
  iata: string,
  direction: RouteDirection,
  signal?: AbortSignal,
): Promise<Airport[]> {
  const params = new URLSearchParams({ direction });
  return getJson(
    `/api/airports/${encodeURIComponent(iata)}/routes?${params}`,
    signal,
  );
}

// Resolves to null when no route exists between the two airports.
export async function fetchRoute(
  fromIata: string,
  toIata: string,
  signal?: AbortSignal,
): Promise<Route | null> {
  const params = new URLSearchParams({ from: fromIata, to: toIata });
  try {
    return await getJson<Route>(`/api/routes?${params}`, signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
