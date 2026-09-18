import { useCallback } from "react";

import {
  ALLIANCES,
  NO_FILTERS,
  type NumberRange,
  type OpenRange,
  type RouteFilters,
} from "../../api/flights";
import AirlinePicker from "./AirlinePicker";
import CheckboxList from "./CheckboxList";
import FilterDropdown from "./FilterDropdown";
import RangeSlider from "./RangeSlider";

import "./FilterBar.css";

type FilterBarProps = {
  filters: RouteFilters;
  onChange: (filters: RouteFilters) => void;
  showIndirect: boolean;
  onShowIndirectChange: (showIndirect: boolean) => void;
};

// The far end of each track means "this and above", so routes longer than
// anything in today's data are still covered without changing these. Today
// only Singapore-New York is 15,000 km+, and ten routes are 18h+.
const DISTANCE_MAX_KM = 15000;
const DURATION_MAX_MINUTES = 18 * 60;

const distanceStep = (km: number) => (km < 5000 ? 50 : 250);
const durationStep = (minutes: number) => (minutes < 180 ? 5 : 15);

function formatDistance(km: number) {
  return `${km.toLocaleString("en-US")} km`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return rest === 0 ? "0h" : `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// For the slider: the end of the track reads as open, "15,000 km+".
function formatOnTrack(format: (value: number) => string, trackEnd: number) {
  return (value: number) => (value >= trackEnd ? `${format(value)}+` : format(value));
}

// The button text, leaving out an end that restricts nothing:
// "Up to 4,000 km", "1,500 km+", "1,500 km – 4,000 km".
function summarizeRange(range: OpenRange | null, format: (value: number) => string) {
  if (!range) return null;
  if (range.max === null) return `${format(range.min)}+`;
  if (range.min === 0) return `Up to ${format(range.max)}`;
  if (range.min === range.max) return format(range.min);
  return `${format(range.min)} – ${format(range.max)}`;
}

// Slider positions to a filter: the far end becomes an open upper bound, and
// a range spanning the whole track filters nothing, so it is stored as null.
function toFilter(range: NumberRange, trackEnd: number): OpenRange | null {
  const max = range.max >= trackEnd ? null : range.max;
  return range.min === 0 && max === null ? null : { min: range.min, max };
}

function toSlider(range: OpenRange | null, trackEnd: number): NumberRange {
  return { min: range?.min ?? 0, max: range?.max ?? trackEnd };
}

const distanceOnTrack = formatOnTrack(formatDistance, DISTANCE_MAX_KM);
const durationOnTrack = formatOnTrack(formatDuration, DURATION_MAX_MINUTES);

// One dropdown per filter. Separate filters narrow each other; options picked
// within one dropdown combine (Star Alliance or SkyTeam; TAP or Iberia).
function FilterBar({
  filters,
  onChange,
  showIndirect,
  onShowIndirectChange,
}: FilterBarProps) {
  // Stable per filters value, so the sliders do not rebind their release
  // listeners on unrelated re-renders.
  const commitDistance = useCallback(
    (range: NumberRange) =>
      onChange({ ...filters, distanceKm: toFilter(range, DISTANCE_MAX_KM) }),
    [filters, onChange],
  );
  const commitDuration = useCallback(
    (range: NumberRange) =>
      onChange({
        ...filters,
        durationMinutes: toFilter(range, DURATION_MAX_MINUTES),
      }),
    [filters, onChange],
  );

  const activeFilters = [
    filters.alliances.length > 0,
    filters.airlines.length > 0,
    filters.distanceKm !== null,
    filters.durationMinutes !== null,
  ].filter(Boolean).length;

  return (
    <div className="filter-bar" role="group" aria-label="Route filters">
      <FilterDropdown
        label="Alliances"
        summary={filters.alliances.length > 0 ? String(filters.alliances.length) : null}
        onClear={() => onChange({ ...filters, alliances: [] })}
      >
        <CheckboxList
          options={ALLIANCES}
          selected={filters.alliances}
          onChange={(alliances) => onChange({ ...filters, alliances })}
        />
      </FilterDropdown>

      <FilterDropdown
        label="Airlines"
        summary={filters.airlines.length > 0 ? String(filters.airlines.length) : null}
        onClear={() => onChange({ ...filters, airlines: [] })}
      >
        <AirlinePicker
          selected={filters.airlines}
          onChange={(airlines) => onChange({ ...filters, airlines })}
        />
      </FilterDropdown>

      <FilterDropdown
        label="Distance"
        summary={summarizeRange(filters.distanceKm, formatDistance)}
        onClear={() => onChange({ ...filters, distanceKm: null })}
      >
        <RangeSlider
          label="distance"
          max={DISTANCE_MAX_KM}
          value={toSlider(filters.distanceKm, DISTANCE_MAX_KM)}
          onCommit={commitDistance}
          step={distanceStep}
          format={distanceOnTrack}
        />
      </FilterDropdown>

      <FilterDropdown
        label="Duration"
        summary={summarizeRange(filters.durationMinutes, formatDuration)}
        onClear={() => onChange({ ...filters, durationMinutes: null })}
      >
        <RangeSlider
          label="duration"
          max={DURATION_MAX_MINUTES}
          value={toSlider(filters.durationMinutes, DURATION_MAX_MINUTES)}
          onCommit={commitDuration}
          step={durationStep}
          format={durationOnTrack}
        />
      </FilterDropdown>

      <span className="filter-bar-divider" aria-hidden="true" />

      <button
        type="button"
        role="switch"
        className="filter-toggle"
        aria-checked={showIndirect}
        title="Around a selected airport, also show the airports it has no direct flight to"
        onClick={() => onShowIndirectChange(!showIndirect)}
      >
        <span className="filter-toggle-track" aria-hidden="true" />
        Show indirect routes
      </button>

      {activeFilters > 1 && (
        <button
          type="button"
          className="filter-bar-clear"
          onClick={() => onChange(NO_FILTERS)}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export default FilterBar;
