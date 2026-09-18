import type { Airport, Route } from "../../api/flights";
import { haversineDistanceKm } from "../../data/geo";
import AirlineServices from "./AirlineServices";
import { formatDuration } from "./formatDuration";
import RoutePass from "./RoutePass";

import "../../styles/sheet.css";
import "./RouteInfoPanel.css";

type RouteInfoPanelProps = {
  departureAirport: Airport;
  arrivalAirport: Airport;
  route: Route;
  // Given on phones, where the panel fills the screen and needs a way out.
  onClose?: () => void;
};

function RouteInfoPanel({
  departureAirport,
  arrivalAirport,
  route,
  onClose,
}: RouteInfoPanelProps) {
  const distanceKm = Math.round(haversineDistanceKm(departureAirport, arrivalAirport));
  const count = route.services.length;

  return (
    <section className="route-info-panel" aria-label="Route details">
      {onClose && (
        <div className="sheet-header">
          <h2 className="sheet-title">Route details</h2>
          <button
            type="button"
            className="sheet-close"
            aria-label="Close route details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      )}

      <RoutePass
        departure={departureAirport}
        arrival={arrivalAirport}
        above={formatDuration(route.durationMinutes)}
        below={`${distanceKm.toLocaleString("en-US")} km`}
      />

      <div className="route-airlines">
        <h2 className="route-airlines-title">
          {count} {count === 1 ? "airline" : "airlines"}
        </h2>
        <AirlineServices services={route.services} />
      </div>
    </section>
  );
}

export default RouteInfoPanel;
