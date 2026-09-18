import { useEffect, useState } from "react";
import { Link } from "react-router";

import FlightMap from "../features/map/FlightMap";
import AirportSearchInput from "../features/airports/AirportSearchInput";
import RouteInfoPanel from "../features/route/RouteInfoPanel";
import FilterBar from "../features/filters/FilterBar";

import {
  fetchAirports,
  fetchRoute,
  NO_FILTERS,
  type Airport,
  type Route,
  type RouteFilters,
} from "../api/flights";
import logo from "../assets/branding/logo.png";

import "./MapPage.css";

export type SelectionRole = "departure" | "arrival";

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

  const selectedRoute =
    routeResult && routeResult.key === routeKey && routeResult.filters === filters
      ? routeResult.route
      : null;

  return (
    <main className="map-page">
      <FlightMap
        airports={airports}
        departureAirport={departureAirport}
        arrivalAirport={arrivalAirport}
        firstSelectedRole={firstSelectedRole}
        filters={filters}
        showIndirect={showIndirect}
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
      </div>
    </main>
  );
}

export default MapPage;
