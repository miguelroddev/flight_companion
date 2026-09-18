import { useEffect, useMemo, useState } from "react";

import { fetchAirlines, type Airline } from "../../api/flights";
import AirlineLogo from "../route/AirlineLogo";

// Only airlines with a code can be filtered on, since the filter is by code.
type CodedAirline = Airline & { iata: string };

type AirlinePickerProps = {
  // IATA codes
  selected: readonly string[];
  onChange: (selected: string[]) => void;
};

// Lowercase, accents stripped, and letters and digits only, so "aerolineas"
// finds "Aerolíneas Argentinas" and "airchina" finds "Air China".
function searchable(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function AirlineOption({
  airline,
  checked,
  onToggle,
}: {
  airline: CodedAirline;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="filter-dropdown-option airline-option">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <AirlineLogo airline={airline} small />
      <span className="airline-option-name">{airline.name}</span>
      <span className="airline-option-code">{airline.iata}</span>
    </label>
  );
}

// Every airline, searchable by name or code. Ticked ones are repeated in a
// "Selected" section at the top so they stay in view while searching;
// unticking either copy deselects.
function AirlinePicker({ selected, onChange }: AirlinePickerProps) {
  const [airlines, setAirlines] = useState<CodedAirline[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAirlines()
      .then((list) => {
        if (!cancelled) setAirlines(list.filter((airline): airline is CodedAirline => airline.iata !== null));
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCode = useMemo(
    () =>
      Object.fromEntries((airlines ?? []).map((airline) => [airline.iata, airline])) as Record<
        string,
        CodedAirline
      >,
    [airlines],
  );

  const matches = useMemo(() => {
    const needle = searchable(query.trim());
    if (!airlines || !needle) return airlines ?? [];
    return airlines.filter(
      (airline) =>
        searchable(airline.name).includes(needle) ||
        searchable(airline.iata).startsWith(needle),
    );
  }, [airlines, query]);

  function toggle(code: string) {
    onChange(
      selected.includes(code)
        ? selected.filter((value) => value !== code)
        : [...selected, code],
    );
  }

  if (failed) return <p className="airline-picker-status">Couldn't load airlines.</p>;
  if (!airlines) return <p className="airline-picker-status">Loading airlines…</p>;

  const selectedAirlines = selected
    .map((code) => byCode[code])
    .filter((airline) => airline !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="airline-picker">
      <input
        type="search"
        className="airline-picker-search"
        placeholder="Search airlines"
        aria-label="Search airlines"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />

      <div className="airline-picker-list">
        {selectedAirlines.length > 0 && (
          <section>
            <div className="airline-picker-heading-row">
              <h3 className="airline-picker-heading">Selected airlines</h3>
              <button
                type="button"
                className="airline-picker-clear"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            </div>
            {selectedAirlines.map((airline) => (
              <AirlineOption
                key={airline.iata}
                airline={airline}
                checked
                onToggle={() => toggle(airline.iata)}
              />
            ))}
          </section>
        )}

        <section>
          <h3 className="airline-picker-heading">All airlines</h3>
          {matches.length === 0 ? (
            <p className="airline-picker-status">No airline matches “{query.trim()}”.</p>
          ) : (
            matches.map((airline) => (
              <AirlineOption
                key={airline.iata}
                airline={airline}
                checked={selected.includes(airline.iata)}
                onToggle={() => toggle(airline.iata)}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

export default AirlinePicker;
