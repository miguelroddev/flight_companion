import { useState } from "react";
import { Link } from "react-router";

import FlightMap from "../features/map/FlightMap";
import AirportSearchInput from "../features/airports/AirportSearchInput";

import { airports, type Airport } from "../data/airports";

import "./MapPage.css";

export type SelectionRole = "departure" | "arrival";

function MapPage() {
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

  return (
    <main className="map-page">
      <FlightMap
        departureAirport={departureAirport}
        arrivalAirport={arrivalAirport}
        firstSelectedRole={firstSelectedRole}
        onAirportClick={handleAirportClick}
      />

      <nav className="map-navbar" aria-label="Main navigation">
        <Link className="navbar-brand" to="/">
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
    </main>
  );
}

export default MapPage;
