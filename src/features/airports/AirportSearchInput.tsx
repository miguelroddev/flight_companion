import { useEffect, useState } from "react";
import type { Airport } from "../../data/airports";
import "./AirportSearchInput.css";

type AirportSearchInputProps = {
  label: string;
  airports: Airport[];
  selectedAirport: Airport | null;
  onSelect: (airport: Airport) => void;
  onClear: () => void;
};

function AirportSearchInput({
  label,
  airports,
  selectedAirport,
  onSelect,
  onClear,
}: AirportSearchInputProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(
      selectedAirport ? `${selectedAirport.iata} - ${selectedAirport.city}` : "",
    );
  }, [selectedAirport]);

  const normalizedQuery = query.trim().toLowerCase();

  const matchingAirports =
    normalizedQuery.length === 0
      ? []
      : airports
          .filter((airport) => {
            const searchableText =
              `${airport.iata} ${airport.name} ${airport.city}`.toLowerCase();

            return searchableText.includes(normalizedQuery);
          })
          .slice(0, 6); //takes only the first 6 airports

  function handleSelect(airport: Airport) {
    onSelect(airport);
    setIsOpen(false);
  }

  function handleClear() {
    onClear();
    setIsOpen(false);
  }

  return (
    <div className="airport-search">
      <label className="airport-search-label">
        <span>{label}</span>

        <input
          type="search"
          value={query}
          placeholder={`${label} airport`}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length > 0) {
              setIsOpen(true);
            }
          }}
        />
      </label>

      {selectedAirport && (
        <button
          type="button"
          className="airport-search-clear"
          onClick={handleClear}
          aria-label={`Clear ${label.toLowerCase()} airport`}
        >
          x
        </button>
      )}

      {isOpen && matchingAirports.length > 0 && (
        <ul className="airport-suggestions">
          {matchingAirports.map((airport) => (
            <li key={airport.id}>
              <button
                type="button"
                onMouseDown={() => handleSelect(airport)}
              >
                <span className="airport-code">{airport.iata}</span>

                <span className="airport-description">
                  <strong>{airport.city}</strong>
                  <small>{airport.name}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedAirport && (
        <span className="selected-airport-indicator">
          Selected: {selectedAirport.iata}
        </span>
      )}
    </div>
  );
}

export default AirportSearchInput;