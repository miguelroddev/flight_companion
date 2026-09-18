import { useState } from "react";

import type { Airline } from "../../api/flights";
import { AIRLINE_LOGO_CODES } from "./airlineLogos.generated";

import "./AirlineLogo.css";

function airlineInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

// Logos live in public/airline-logos, keyed by IATA code and fetched by
// scripts/fetch-airline-logos.mjs. Airlines without one, or whose file fails
// to load, get their initials instead.
function AirlineLogo({ airline, small = false }: { airline: Airline; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = small ? " airline-icon--small" : "";
  const hasLogo = airline.iata !== null && AIRLINE_LOGO_CODES.has(airline.iata);

  if (!hasLogo || failed) {
    return (
      <span className={`airline-icon airline-icon--fallback${size}`} aria-hidden="true">
        {airlineInitials(airline.name)}
      </span>
    );
  }

  return (
    <img
      className={`airline-icon${size}`}
      src={`/airline-logos/${airline.iata}.png`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default AirlineLogo;
