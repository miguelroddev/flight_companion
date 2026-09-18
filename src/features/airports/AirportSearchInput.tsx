import { useEffect, useMemo, useRef, useState } from "react";

import type { Airport } from "../../api/flights";
import { indexAirports, searchAirports } from "./airportSearch";

import "./AirportSearchInput.css";

type AirportSearchInputProps = {
  label: string;
  airports: Airport[];
  selectedAirport: Airport | null;
  onSelect: (airport: Airport) => void;
  onClear: () => void;
};

// Shows the selected airport as a code chip and its name. Clicking in opens
// an empty search in its place; picking nothing (a press outside, Escape,
// tabbing away) puts the selected airport straight back, untouched.
function AirportSearchInput({
  label,
  airports,
  selectedAirport,
  onSelect,
  onClear,
}: AirportSearchInputProps) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(() => indexAirports(airports), [airports]);
  const suggestions = useMemo(() => searchAirports(index, query), [index, query]);

  function stopEditing() {
    setEditing(false);
    setQuery("");
  }

  // A press outside the box and its suggestions ends the search, map
  // included (maplibre can keep the input from losing focus), as does Escape.
  useEffect(() => {
    if (!editing) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) stopEditing();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      stopEditing();
      inputRef.current?.blur();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editing]);

  function handleSelect(airport: Airport) {
    onSelect(airport);
    stopEditing();
    inputRef.current?.blur();
  }

  const showingSelection = selectedAirport !== null && !editing;
  const place = selectedAirport ? selectedAirport.city || selectedAirport.name : "";

  return (
    <div className="airport-search" ref={containerRef}>
      <label className="airport-search-label">
        <span className="airport-search-role">{label}</span>

        <input
          ref={inputRef}
          type="search"
          value={showingSelection ? "" : query}
          placeholder={
            showingSelection ? "" : selectedAirport ? `Change ${place}…` : `${label} airport`
          }
          aria-label={
            selectedAirport
              ? `${label}: ${place} (${selectedAirport.iata}). Type to change it.`
              : `${label} airport`
          }
          autoComplete="off"
          onFocus={() => setEditing(true)}
          // Tabbing away; pointer presses outside are handled above.
          onBlur={stopEditing}
          onChange={(event) => {
            setEditing(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && suggestions.length > 0) {
              event.preventDefault();
              handleSelect(suggestions[0]);
            }
          }}
        />

        {showingSelection && (
          <span className="airport-search-selection" aria-hidden="true">
            <strong className="airport-search-selection-code">{selectedAirport.iata}</strong>
            <span className="airport-search-selection-place">{place}</span>
            {selectedAirport.city && (
              <span className="airport-search-selection-name">{selectedAirport.name}</span>
            )}
          </span>
        )}
      </label>

      {showingSelection && (
        <button
          type="button"
          className="airport-search-clear"
          onClick={() => {
            onClear();
            stopEditing();
          }}
          aria-label={`Clear ${label.toLowerCase()} airport`}
        >
          ×
        </button>
      )}

      {editing && suggestions.length > 0 && (
        <ul className="airport-suggestions">
          {suggestions.map((airport) => (
            <li key={airport.iata}>
              <button
                type="button"
                // Before the input's blur, which would end the search first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(airport);
                }}
              >
                <span className="airport-code">{airport.iata}</span>

                <span className="airport-description">
                  <strong>{airport.city || airport.name}</strong>
                  <small>{airport.name}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AirportSearchInput;
