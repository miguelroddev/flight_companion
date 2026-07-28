import { airports, type Airport } from "./airports";
import { haversineDistanceKm } from "./geo";

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
  airline: string;
  // null means "not available" (schedule unknown/not published), distinct
  // from [] which would mean the airline is known to operate zero days.
  operatingDays: DayOfWeek[] | null;
};

export type Route = {
  id: string;
  departureAirportId: string;
  arrivalAirportId: string;
  durationMinutes: number;
  services: AirlineService[];
};

const DAILY: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

export const routes: Route[] = [
  {
    id: "lis-lhr",
    departureAirportId: "lis",
    arrivalAirportId: "lhr",
    durationMinutes: 155,
    services: [
      { airline: "TAP Air Portugal", operatingDays: DAILY },
      { airline: "British Airways", operatingDays: ["fri", "sat", "sun"] },
    ],
  },
  {
    id: "lis-fra",
    departureAirportId: "lis",
    arrivalAirportId: "fra",
    durationMinutes: 175,
    services: [{ airline: "Lufthansa", operatingDays: DAILY }],
  },
  {
    id: "muc-lhr",
    departureAirportId: "muc",
    arrivalAirportId: "lhr",
    durationMinutes: 115,
    services: [{ airline: "Lufthansa", operatingDays: WEEKDAYS }],
  },
  {
    id: "muc-fra",
    departureAirportId: "muc",
    arrivalAirportId: "fra",
    durationMinutes: 65,
    services: [{ airline: "Lufthansa", operatingDays: DAILY }],
  },
  {
    id: "fra-lhr",
    departureAirportId: "fra",
    arrivalAirportId: "lhr",
    durationMinutes: 95,
    services: [
      { airline: "British Airways", operatingDays: null },
      { airline: "Lufthansa", operatingDays: ["mon", "wed", "fri"] },
    ],
  },
  {
    id: "lis-pek",
    departureAirportId: "lis",
    arrivalAirportId: "pek",
    durationMinutes: 705,
    services: [{ airline: "Air China", operatingDays: ["tue", "thu", "sat"] }],
  },
  {
    id: "muc-pek",
    departureAirportId: "muc",
    arrivalAirportId: "pek",
    durationMinutes: 610,
    services: [{ airline: "Air China", operatingDays: DAILY }],
  },
  {
    id: "muc-sfo",
    departureAirportId: "muc",
    arrivalAirportId: "sfo",
    durationMinutes: 700,
    services: [{ airline: "Lufthansa", operatingDays: DAILY }],
  },
  {
    id: "lhr-sfo",
    departureAirportId: "lhr",
    arrivalAirportId: "sfo",
    durationMinutes: 650,
    services: [{ airline: "British Airways", operatingDays: DAILY }],
  },
  {
    id: "lis-bsb",
    departureAirportId: "lis",
    arrivalAirportId: "bsb",
    durationMinutes: 580,
    services: [
      { airline: "TAP Air Portugal", operatingDays: ["mon", "wed", "fri", "sun"] },
    ],
  },
  {
    id: "bsb-lis",
    departureAirportId: "bsb",
    arrivalAirportId: "lis",
    durationMinutes: 560,
    services: [
      { airline: "TAP Air Portugal", operatingDays: ["mon", "wed", "fri", "sun"] },
    ],
  },
  {
    id: "lhr-cpt",
    departureAirportId: "lhr",
    arrivalAirportId: "cpt",
    durationMinutes: 710,
    services: [{ airline: "British Airways", operatingDays: DAILY }],
  },
  {
    id: "cpt-lhr",
    departureAirportId: "cpt",
    arrivalAirportId: "lhr",
    durationMinutes: 690,
    services: [{ airline: "British Airways", operatingDays: DAILY }],
  },
  {
    id: "fra-cpt",
    departureAirportId: "fra",
    arrivalAirportId: "cpt",
    durationMinutes: 680,
    services: [
      { airline: "Lufthansa", operatingDays: ["tue", "thu", "sat", "sun"] },
    ],
  },
  {
    id: "lhr-syd",
    departureAirportId: "lhr",
    arrivalAirportId: "syd",
    durationMinutes: 1310,
    services: [{ airline: "Qantas", operatingDays: DAILY }],
  },
  {
    id: "syd-lhr",
    departureAirportId: "syd",
    arrivalAirportId: "lhr",
    durationMinutes: 1290,
    services: [{ airline: "Qantas", operatingDays: DAILY }],
  },
  {
    id: "pek-syd",
    departureAirportId: "pek",
    arrivalAirportId: "syd",
    durationMinutes: 665,
    services: [
      { airline: "China Southern", operatingDays: ["mon", "thu", "sat"] },
    ],
  },
  {
    id: "sfo-hnd",
    departureAirportId: "sfo",
    arrivalAirportId: "hnd",
    durationMinutes: 635,
    services: [{ airline: "All Nippon Airways", operatingDays: DAILY }],
  },
  {
    id: "hnd-sfo",
    departureAirportId: "hnd",
    arrivalAirportId: "sfo",
    durationMinutes: 590,
    services: [{ airline: "All Nippon Airways", operatingDays: DAILY }],
  },
  {
    id: "fra-hnd",
    departureAirportId: "fra",
    arrivalAirportId: "hnd",
    durationMinutes: 705,
    services: [
      { airline: "Lufthansa", operatingDays: ["mon", "tue", "thu", "fri", "sun"] },
    ],
  },
  {
    id: "muc-waw",
    departureAirportId: "muc",
    arrivalAirportId: "waw",
    durationMinutes: 110,
    services: [{ airline: "Lufthansa", operatingDays: WEEKDAYS }],
  },
  {
    id: "waw-muc",
    departureAirportId: "waw",
    arrivalAirportId: "muc",
    durationMinutes: 115,
    services: [{ airline: "Lufthansa", operatingDays: WEEKDAYS }],
  },
];

// A route only connects departure -> arrival in the direction it was
// explicitly defined. "lis-lhr" existing does NOT imply "lhr-lis" exists -
// that would need its own separate Route entry.
export function getOutboundRoutes(airportId: string): Route[] {
  return routes.filter((route) => route.departureAirportId === airportId);
}

export function getInboundRoutes(airportId: string): Route[] {
  return routes.filter((route) => route.arrivalAirportId === airportId);
}

export function getConnectedAirports(
  airportId: string,
  role: "departure" | "arrival",
): Airport[] {
  const connectedIds =
    role === "departure"
      ? getOutboundRoutes(airportId).map((route) => route.arrivalAirportId)
      : getInboundRoutes(airportId).map((route) => route.departureAirportId);

  return airports.filter((airport) => connectedIds.includes(airport.id));
}

export function getRoute(
  departureAirportId: string,
  arrivalAirportId: string,
): Route | undefined {
  return routes.find(
    (route) =>
      route.departureAirportId === departureAirportId &&
      route.arrivalAirportId === arrivalAirportId,
  );
}

export function getRouteDistanceKm(route: Route): number {
  const departure = airports.find(
    (airport) => airport.id === route.departureAirportId,
  );
  const arrival = airports.find(
    (airport) => airport.id === route.arrivalAirportId,
  );
  if (!departure || !arrival) return 0;

  return haversineDistanceKm(departure, arrival);
}
