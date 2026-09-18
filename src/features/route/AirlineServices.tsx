import { ALLIANCES, DAYS_OF_WEEK, type AirlineService } from "../../api/flights";
import AirlineLogo from "./AirlineLogo";

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

// The airlines flying one route: logo, name, days (once schedules exist) and
// alliance.
function AirlineServices({ services }: { services: AirlineService[] }) {
  return (
    <ul className="route-airlines-list">
      {services.map((service) => (
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
  );
}

export default AirlineServices;
