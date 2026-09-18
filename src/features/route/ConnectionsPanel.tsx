import { useEffect, useState } from "react";

import {
  fetchRoute,
  type Airport,
  type Itineraries,
  type Itinerary,
  type Route,
  type RouteFilters,
} from "../../api/flights";
import { haversineDistanceKm } from "../../data/geo";
import AirlineServices from "./AirlineServices";
import { formatDuration } from "./formatDuration";
import RoutePass from "./RoutePass";

import "../../styles/sheet.css";
import "./RouteInfoPanel.css";
import "./ConnectionsPanel.css";

type ConnectionsPanelProps = {
  departureAirport: Airport;
  arrivalAirport: Airport;
  // null while the search runs
  result: Itineraries | null;
  failed: boolean;
  filters: RouteFilters;
  filtersActive: boolean;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  // Given on phones, where the panel fills the screen and needs a way out.
  onClose?: () => void;
};

function placeName(airport: Airport) {
  return airport.city || airport.name;
}

// One leg of the chosen itinerary, with the airlines that fly it, fetched
// when the card appears.
function LegCard({
  number,
  from,
  to,
  minutes,
  filters,
}: {
  number: number;
  from: Airport;
  to: Airport;
  minutes: number;
  filters: RouteFilters;
}) {
  const [leg, setLeg] = useState<{ route: Route | null; failed: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchRoute(from.iata, to.iata, filters, controller.signal)
      .then((route) => setLeg({ route, failed: false }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setLeg({ route: null, failed: true });
      });
    return () => controller.abort();
  }, [from.iata, to.iata, filters]);

  return (
    <article className="connection-leg">
      <header className="connection-leg-header">
        <span className="connection-leg-number">{number}</span>
        <span className="connection-leg-route" title={`${from.name} → ${to.name}`}>
          <strong>{from.iata}</strong>
          <span className="connection-leg-arrow" aria-hidden="true">→</span>
          <strong>{to.iata}</strong>
          <span className="connection-leg-places">
            {placeName(from)} to {placeName(to)}
          </span>
        </span>
        <span className="connection-leg-time">{formatDuration(minutes)}</span>
      </header>

      {leg === null && <p className="connections-status">Loading airlines…</p>}
      {leg?.failed && <p className="connections-status">Couldn't load the airlines.</p>}
      {leg?.route && <AirlineServices services={leg.route.services} />}
    </article>
  );
}

function ItineraryOption({
  itinerary,
  selected,
  onClick,
}: {
  itinerary: Itinerary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="connection-option"
        aria-pressed={selected}
        onClick={onClick}
      >
        <span className="connection-via">
          <span className="connection-via-label">via</span>
          {itinerary.via.map((airport, index) => (
            <span key={airport.iata} className="connection-stop" title={airport.name}>
              {index > 0 && (
                <span className="connection-stop-separator" aria-label="then">
                  ›
                </span>
              )}
              {placeName(airport)}
              <span className="connection-stop-code">{airport.iata}</span>
            </span>
          ))}
        </span>
        <span className="connection-time">{formatDuration(itinerary.totalMinutes)}</span>
      </button>
    </li>
  );
}

// Shown in place of the route panel when no direct flight exists: the ways
// to get there with one stop, or two, fastest first. Picking one expands the
// panel with a card for each leg.
function ConnectionsPanel({
  departureAirport,
  arrivalAirport,
  result,
  failed,
  filters,
  filtersActive,
  selectedIndex,
  onSelect,
  onClose,
}: ConnectionsPanelProps) {
  const distanceKm = Math.round(haversineDistanceKm(departureAirport, arrivalAirport));
  const itineraries = result?.itineraries ?? [];
  const selected = selectedIndex === null ? null : itineraries[selectedIndex];
  const stops = result?.stops ?? null;

  const passAbove = failed
    ? "Unavailable"
    : result === null
      ? "Searching…"
      : stops === null
        ? "No route"
        : `${stops} ${stops === 1 ? "stop" : "stops"}`;
  const passBelow = itineraries.length
    ? `from ${formatDuration(itineraries[0].totalMinutes)}`
    : `${distanceKm.toLocaleString("en-US")} km`;

  return (
    <section className="route-info-panel connections-panel" aria-label="Connections">
      {onClose && (
        <div className="sheet-header">
          <h2 className="sheet-title">Connections</h2>
          <button
            type="button"
            className="sheet-close"
            aria-label="Close connections"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      )}

      <RoutePass
        departure={departureAirport}
        arrival={arrivalAirport}
        above={passAbove}
        below={passBelow}
      />

      <div className="route-airlines">
        {failed && <p className="connections-status">Couldn't search for connections.</p>}

        {result === null && !failed && (
          <p className="connections-status">Looking for connections…</p>
        )}

        {result !== null && stops === null && (
          <div className="connections-empty">
            <strong>No route with two stops or fewer</strong>
            <p>
              We couldn't find a way to fly from {placeName(departureAirport)} to{" "}
              {placeName(arrivalAirport)} with up to two stops.
              {filtersActive && " Loosening your filters may help."}
            </p>
          </div>
        )}

        {stops !== null && (
          <>
            <h2 className="route-airlines-title">
              No direct flights · {itineraries.length}{" "}
              {itineraries.length === 1 ? "option" : "options"}
            </h2>

            <ul className="connection-options">
              {itineraries.map((itinerary, index) => (
                <ItineraryOption
                  key={itinerary.via.map((airport) => airport.iata).join("-")}
                  itinerary={itinerary}
                  selected={index === selectedIndex}
                  onClick={() => onSelect(index === selectedIndex ? null : index)}
                />
              ))}
            </ul>

            <p className="connections-note">Flying time only; layovers are not included.</p>
          </>
        )}
      </div>

      {selected && (
        <div className="connection-legs">
          <h2 className="route-airlines-title">Your itinerary</h2>
          {[departureAirport, ...selected.via].map((from, index, starts) => {
            const to = starts[index + 1] ?? arrivalAirport;
            return (
              <LegCard
                key={`${from.iata}-${to.iata}`}
                number={index + 1}
                from={from}
                to={to}
                minutes={selected.legMinutes[index]}
                filters={filters}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ConnectionsPanel;
