import type { Airport } from "../../data/airports";
import { DAYS_OF_WEEK, getRouteDistanceKm, type Route } from "../../data/routes";
import { airlineIcons } from "./airlineIcons";

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

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

function airlineInitials(airline: string): string {
  return airline
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function RouteInfoPanel({
  departureAirport,
  arrivalAirport,
  route,
}: RouteInfoPanelProps) {
  const distanceKm = Math.round(getRouteDistanceKm(route));

  return (
    <section className="route-info-panel" aria-label="Route details">
      <div className="route-info-header">
        <span>
          {departureAirport.name} ({departureAirport.iata})
        </span>
        <span className="route-info-arrow">→</span>
        <span>
          {arrivalAirport.name} ({arrivalAirport.iata})
        </span>
      </div>

      <div className="route-info-meta">
        {distanceKm.toLocaleString()} km · {formatDuration(route.durationMinutes)}
      </div>

      <div className="route-info-services">
        {route.services.map((service) => (
          <div className="airline-row" key={service.airline}>
            {airlineIcons[service.airline] ? (
              <img
                className="airline-icon"
                src={airlineIcons[service.airline]}
                alt=""
                aria-hidden="true"
              />
            ) : (
              <span className="airline-icon airline-icon--fallback" aria-hidden="true">
                {airlineInitials(service.airline)}
              </span>
            )}
            <span className="airline-name">{service.airline}</span>
            {service.operatingDays === null ? (
              <span className="airline-days-unavailable">Not available</span>
            ) : (
              <div className="airline-days">
                {DAYS_OF_WEEK.map((day) => (
                  <span
                    key={day}
                    className={
                      service.operatingDays?.includes(day)
                        ? "day-chip day-chip--active"
                        : "day-chip"
                    }
                    title={day}
                  >
                    {DAY_LABELS[day]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default RouteInfoPanel;
