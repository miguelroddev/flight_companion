import { airports, type Airport } from "./airports";

export type Route = {
  id: string;
  departureAirportId: string;
  arrivalAirportId: string;
  airline: string;
};

export const routes: Route[] = [
  {
    id: "lis-lhr",
    departureAirportId: "lis",
    arrivalAirportId: "lhr",
    airline: "TAP Air Portugal",
  },
  {
    id: "lis-fra",
    departureAirportId: "lis",
    arrivalAirportId: "fra",
    airline: "Lufthansa",
  },
  {
    id: "muc-lhr",
    departureAirportId: "muc",
    arrivalAirportId: "lhr",
    airline: "Lufthansa",
  },
  {
    id: "muc-fra",
    departureAirportId: "muc",
    arrivalAirportId: "fra",
    airline: "Lufthansa",
  },
  {
    id: "fra-lhr",
    departureAirportId: "fra",
    arrivalAirportId: "lhr",
    airline: "British Airways",
  },
  {
    id: "lis-pek",
    departureAirportId: "lis",
    arrivalAirportId: "pek",
    airline: "Air China",
  },
  {
    id: "muc-pek",
    departureAirportId: "muc",
    arrivalAirportId: "pek",
    airline: "Air China",
  },
  {
    id: "muc-sfo",
    departureAirportId: "muc",
    arrivalAirportId: "sfo",
    airline: "Lufthansa",
  },
  {
    id: "lhr-sfo",
    departureAirportId: "lhr",
    arrivalAirportId: "sfo",
    airline: "British Airways",
  },
  {
    id: "lis-bsb",
    departureAirportId: "lis",
    arrivalAirportId: "bsb",
    airline: "TAP Air Portugal",
  },
  {
    id: "lhr-cpt",
    departureAirportId: "lhr",
    arrivalAirportId: "cpt",
    airline: "British Airways",
  },
  {
    id: "fra-cpt",
    departureAirportId: "fra",
    arrivalAirportId: "cpt",
    airline: "Lufthansa",
  },
  {
    id: "lhr-syd",
    departureAirportId: "lhr",
    arrivalAirportId: "syd",
    airline: "Qantas",
  },
  {
    id: "pek-syd",
    departureAirportId: "pek",
    arrivalAirportId: "syd",
    airline: "China Southern",
  },
  {
    id: "sfo-hnd",
    departureAirportId: "sfo",
    arrivalAirportId: "hnd",
    airline: "All Nippon Airways",
  },
  {
    id: "fra-hnd",
    departureAirportId: "fra",
    arrivalAirportId: "hnd",
    airline: "Lufthansa",
  },
  {
    id: "muc-waw",
    departureAirportId: "muc",
    arrivalAirportId: "waw",
    airline: "Lufthansa",
  },
];

export function getRoutesForAirport(airportId: string): Route[] {
  return routes.filter(
    (route) =>
      route.departureAirportId === airportId ||
      route.arrivalAirportId === airportId,
  );
}

export function getConnectedAirports(airportId: string): Airport[] {
  const connectedIds = getRoutesForAirport(airportId).map((route) =>
    route.departureAirportId === airportId
      ? route.arrivalAirportId
      : route.departureAirportId,
  );

  return airports.filter((airport) => connectedIds.includes(airport.id));
}

export function getRoute(
  airportAId: string,
  airportBId: string,
): Route | undefined {
  return routes.find(
    (route) =>
      (route.departureAirportId === airportAId &&
        route.arrivalAirportId === airportBId) ||
      (route.departureAirportId === airportBId &&
        route.arrivalAirportId === airportAId),
  );
}
