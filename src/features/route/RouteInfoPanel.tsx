import type { Airport, Route } from "../../api/flights";
import { haversineDistanceKm } from "../../data/geo";
import AirlineServices from "./AirlineServices";
import { formatDuration } from "./formatDuration";
import RoutePass from "./RoutePass";

import "./RouteInfoPanel.css";

type RouteInfoPanelProps = {
  departureAirport: Airport;
  arrivalAirport: Airport;
  route: Route;
};

function RouteInfoPanel({ departureAirport, arrivalAirport, route }: RouteInfoPanelProps) {
  const distanceKm = Math.round(haversineDistanceKm(departureAirport, arrivalAirport));
  const count = route.services.length;

  return (
    <section className="route-info-panel" aria-label="Route details">
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
