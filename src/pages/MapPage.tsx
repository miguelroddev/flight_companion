import { useState } from "react";
import { Link } from "react-router";

import FlightMap from "../features/map/FlightMap";
import AirportSearchInput from "../features/airports/AirportSearchInput";

import { airports, type Airport } from "../data/airports";

import "./MapPage.css";

function MapPage() {
  const [departureAirport, setDepartureAirport] =
    useState<Airport | null>(null);

  const [arrivalAirport, setArrivalAirport] =
    useState<Airport | null>(null);

  return (
    <main className="map-page">
      <FlightMap />

      <nav className="map-navbar" aria-label="Main navigation">
        <Link className="navbar-brand" to="/">
          Flight Companion
        </Link>

        <div className="navbar-actions">
          <AirportSearchInput
            label="From"
            airports={airports}
            selectedAirport={departureAirport}
            onSelect={setDepartureAirport}
          />

          <AirportSearchInput
            label="To"
            airports={airports}
            selectedAirport={arrivalAirport}
            onSelect={setArrivalAirport}
          />
        </div>

        <div aria-hidden="true" />
      </nav>
    </main>
  );
}

export default MapPage;