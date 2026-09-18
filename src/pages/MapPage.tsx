import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import FlightMap from "../features/map/FlightMap";
import AirportSearchInput from "../features/airports/AirportSearchInput";
import RouteInfoPanel from "../features/route/RouteInfoPanel";
import ConnectionsPanel from "../features/route/ConnectionsPanel";
import FilterBar from "../features/filters/FilterBar";

import {
  fetchAirports,
  fetchItineraries,
  fetchRoute,
  NO_FILTERS,
  type Airport,
  type Itineraries,
  type Route,
  type RouteFilters,
} from "../api/flights";
import logo from "../assets/branding/logo.png";

import "./MapPage.css";

export type SelectionRole = "departure" | "arrival";

const NO_PATHS: Airport[][] = [];

function MapPage() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [airportsError, setAirportsError] = useState(false);
  // Replaced wholesale on every change, so its identity alone tells the
  // fetches below when to refire.
  const [filters, setFilters] = useState<RouteFilters>(NO_FILTERS);
  // A view option, not a filter: it changes nothing fetched, and Clear all
  // leaves it alone.
  const [showIndirect, setShowIndirect] = useState(false);

  const [departureAirport, setDepartureAirport] =
    useState<Airport | null>(null);

  const [arrivalAirport, setArrivalAirport] =
    useState<Airport | null>(null);

  /* 
  firstSelectedRole is very useful since it's used in the
  control flow of the app
  */
  const [firstSelectedRole, setFirstSelectedRole] =
    useState<SelectionRole | null>(null);

  function selectDeparture(airport: Airport) {
    setDepartureAirport(airport);
    setFirstSelectedRole((role) => role ?? "departure");
  }

  function selectArrival(airport: Airport) {
    setArrivalAirport(airport);
    setFirstSelectedRole((role) => role ?? "arrival");
  }

  function clearDeparture() {
    setDepartureAirport(null);
    setFirstSelectedRole((role) =>
      role === "departure" ? (arrivalAirport ? "arrival" : null) : role,
    );
  }

  function clearArrival() {
    setArrivalAirport(null);
    setFirstSelectedRole((role) =>
      role === "arrival" ? (departureAirport ? "departure" : null) : role,
    );
  }

  function handleAirportClick(airport: Airport) {
    if (!departureAirport) {
      selectDeparture(airport);
    } else if (!arrivalAirport) {
      selectArrival(airport);
    } else if (firstSelectedRole === "departure") {
      selectArrival(airport);
    } else {
      selectDeparture(airport);
    }
  }

  // Tagged with the pair it was fetched for, so a slow response for a
  // previous selection is never shown for the current one
  const [routeResult, setRouteResult] = useState<{
    key: string;
    filters: RouteFilters;
    route: Route | null;
  } | null>(null);

  const departureIata = departureAirport?.iata;
  const arrivalIata = arrivalAirport?.iata;
  const routeKey =
    departureIata && arrivalIata ? `${departureIata}-${arrivalIata}` : null;

  useEffect(() => {
    const controller = new AbortController();
    fetchAirports(filters, controller.signal)
      .then((airports) => {
        setAirports(airports);
        setAirportsError(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setAirportsError(true);
      });
    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    if (!departureIata || !arrivalIata) return;

    const key = `${departureIata}-${arrivalIata}`;
    const controller = new AbortController();
    fetchRoute(departureIata, arrivalIata, filters, controller.signal)
      .then((route) => setRouteResult({ key, filters, route }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setRouteResult({ key, filters, route: null });
      });
    return () => controller.abort();
  }, [departureIata, arrivalIata, filters]);

  const routeIsCurrent =
    routeResult !== null && routeResult.key === routeKey && routeResult.filters === filters;
  const selectedRoute = routeIsCurrent ? routeResult.route : null;
  // Known to have no direct flight (under the current filters), as opposed to
  // not yet known.
  const noDirectRoute = routeIsCurrent && routeResult.route === null;

  // With no direct flight, the ways to get there with one or two stops.
  // Tagged like routeResult, so a slow answer for an old pair is never shown.
  const [itinerariesResult, setItinerariesResult] = useState<{
    key: string;
    filters: RouteFilters;
    data: Itineraries | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!departureIata || !arrivalIata || !noDirectRoute) return;

    const key = `${departureIata}-${arrivalIata}`;
    const controller = new AbortController();
    fetchItineraries(departureIata, arrivalIata, filters, controller.signal)
      .then((data) => setItinerariesResult({ key, filters, data, failed: false }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setItinerariesResult({ key, filters, data: null, failed: true });
      });
    return () => controller.abort();
  }, [departureIata, arrivalIata, filters, noDirectRoute]);

  const currentItineraries =
    itinerariesResult &&
    itinerariesResult.key === routeKey &&
    itinerariesResult.filters === filters
      ? itinerariesResult
      : null;

  // The itinerary opened in the panel, tied to the result it was picked from,
  // so a new search starts with nothing open.
  const [openedItinerary, setOpenedItinerary] = useState<{
    result: typeof itinerariesResult;
    index: number;
  } | null>(null);
  const openedIndex =
    openedItinerary && currentItineraries && openedItinerary.result === currentItineraries
      ? openedItinerary.index
      : null;

  // Every option as departure, stops and arrival in flying order, for the
  // map to draw; the opened one is drawn over the rest.
  const itineraryPaths = useMemo(() => {
    const itineraries = currentItineraries?.data?.itineraries;
    if (!itineraries || !departureAirport || !arrivalAirport) return NO_PATHS;
    return itineraries.map((itinerary) => [departureAirport, ...itinerary.via, arrivalAirport]);
  }, [currentItineraries, departureAirport, arrivalAirport]);
  const itineraryPath = openedIndex === null ? null : (itineraryPaths[openedIndex] ?? null);

  const filtersActive =
    filters.alliances.length > 0 ||
    filters.airlines.length > 0 ||
    filters.distanceKm !== null ||
    filters.durationMinutes !== null;

  return (
    <main className="map-page">
      <FlightMap
        airports={airports}
        departureAirport={departureAirport}
        arrivalAirport={arrivalAirport}
        firstSelectedRole={firstSelectedRole}
        filters={filters}
        showIndirect={showIndirect}
        itineraryOptions={itineraryPaths}
        itineraryPath={itineraryPath}
        onAirportClick={handleAirportClick}
        onAirportDeselect={(role) =>
          role === "departure" ? clearDeparture() : clearArrival()
        }
      />

      <div className="map-overlay">
        <nav className="map-navbar" aria-label="Main navigation">
          <Link className="navbar-brand" to="/">
            <img src={logo} alt="" className="navbar-logo" />
            Flight Companion
          </Link>

          <div className="navbar-actions">
            <AirportSearchInput
              label="From"
              airports={airports}
              selectedAirport={departureAirport}
              onSelect={selectDeparture}
              onClear={clearDeparture}
            />

            <AirportSearchInput
              label="To"
              airports={airports}
              selectedAirport={arrivalAirport}
              onSelect={selectArrival}
              onClear={clearArrival}
            />
          </div>

          <div aria-hidden="true" />
        </nav>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          showIndirect={showIndirect}
          onShowIndirectChange={setShowIndirect}
        />

        {airportsError && (
          <p className="map-status" role="alert">
            Couldn't load airports. Please try again later.
          </p>
        )}

        {departureAirport && arrivalAirport && selectedRoute && (
          <RouteInfoPanel
            departureAirport={departureAirport}
            arrivalAirport={arrivalAirport}
            route={selectedRoute}
          />
        )}

        {departureAirport && arrivalAirport && noDirectRoute && (
          <ConnectionsPanel
            departureAirport={departureAirport}
            arrivalAirport={arrivalAirport}
            result={currentItineraries?.data ?? null}
            failed={currentItineraries?.failed ?? false}
            filters={filters}
            filtersActive={filtersActive}
            selectedIndex={openedIndex}
            onSelect={(index) =>
              setOpenedItinerary(
                index === null ? null : { result: currentItineraries, index },
              )
            }
          />
        )}
      </div>
    </main>
  );
}

export default MapPage;
