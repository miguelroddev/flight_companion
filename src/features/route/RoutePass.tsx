import type { ReactNode } from "react";

import type { Airport } from "../../api/flights";

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

type RoutePassProps = {
  departure: Airport;
  arrival: Airport;
  // Above the flight path, e.g. the duration
  above: ReactNode;
  // Below it, e.g. the distance
  below: ReactNode;
};

// The header of a route panel, read like a boarding pass: origin and
// destination codes at the ends, the flight between them.
function RoutePass({ departure, arrival, above, below }: RoutePassProps) {
  return (
    <div className="route-pass">
      <Endpoint airport={departure} align="start" />

      <div className="route-pass-middle">
        <span className="route-pass-duration">{above}</span>
        <span className="route-pass-line" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="route-pass-plane">
            {/* Material Design "flight" icon (Apache 2.0), nose up; CSS turns it east. */}
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
        </span>
        <span className="route-pass-distance">{below}</span>
      </div>

      <Endpoint airport={arrival} align="end" />
    </div>
  );
}

export default RoutePass;
