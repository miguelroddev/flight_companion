import {
  ALLIANCES,
  DAYS_OF_WEEK,
  type Airport,
  type AirlineService,
  type Route,
} from "../../api/flights";
import { haversineDistanceKm } from "../../data/geo";
import AirlineLogo from "./AirlineLogo";

import "./RouteInfoPanel.css";

type RouteInfoPanelProps = {
  departureAirport: Airport;
  arrivalAirport: Airport;
  route: Route;
};

const DAY_LABELS: Record<string, string> = {
  sun: "Su",
  mon: "Mo",
  tue: "Tu",
  wed: "We",
  thu: "Th",
  fri: "Fr",
  sat: "Sa",
};

const ALLIANCE_LABELS = Object.fromEntries(
  ALLIANCES.map(({ id, label }) => [id, label]),
) as Record<string, string>;

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "–";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// One end of the pass: the code large, the place beneath it. The city reads
// better than the full airport name, which goes in the tooltip instead.
function Endpoint({ airport, align }: { airport: Airport; align: "start" | "end" }) {
  return (
    <div className={`route-endpoint route-endpoint--${align}`} title={airport.name}>
      <span className="route-endpoint-code">{airport.iata}</span>
      <span className="route-endpoint-place">{airport.city || airport.name}</span>
    </div>
  );
}

function OperatingDays({ service }: { service: AirlineService }) {
  if (service.operatingDays === null) return null;
  return (
    <div className="airline-days" aria-label="Operating days">
      {DAYS_OF_WEEK.map((day) => (
        <span
          key={day}
          className={
            service.operatingDays?.includes(day) ? "day-chip day-chip--active" : "day-chip"
          }
          title={day}
        >
          {DAY_LABELS[day]}
        </span>
      ))}
    </div>
  );
}

function RouteInfoPanel({ departureAirport, arrivalAirport, route }: RouteInfoPanelProps) {
  const distanceKm = Math.round(haversineDistanceKm(departureAirport, arrivalAirport));
  const count = route.services.length;

  return (
    <section className="route-info-panel" aria-label="Route details">
      <div className="route-pass">
        <Endpoint airport={departureAirport} align="start" />

        <div className="route-pass-middle">
          <span className="route-pass-duration">{formatDuration(route.durationMinutes)}</span>
          <span className="route-pass-line" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="route-pass-plane">
              {/* Material Design "flight" icon (Apache 2.0), nose up; CSS turns it east. */}
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </span>
          <span className="route-pass-distance">{distanceKm.toLocaleString("en-US")} km</span>
        </div>

        <Endpoint airport={arrivalAirport} align="end" />
      </div>

      <div className="route-airlines">
        <h2 className="route-airlines-title">
          {count} {count === 1 ? "airline" : "airlines"}
        </h2>

        <ul className="route-airlines-list">
          {route.services.map((service) => (
            <li className="airline-row" key={service.airline.iata ?? service.airline.name}>
              <AirlineLogo airline={service.airline} />
              <span className="airline-name">{service.airline.name}</span>
              <OperatingDays service={service} />
              {service.airline.alliance && (
                <span className="airline-alliance">
                  {ALLIANCE_LABELS[service.airline.alliance]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default RouteInfoPanel;
