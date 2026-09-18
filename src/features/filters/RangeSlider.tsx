import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { NumberRange } from "../../api/flights";

type RangeSliderProps = {
  label: string;
  // The far end of the track; the near end is always 0.
  max: number;
  value: NumberRange;
  // Fires when a handle is let go (or moved by keyboard), not while dragging:
  // every commit refetches the airports.
  onCommit: (value: NumberRange) => void;
  // The spacing of selectable values around a value, e.g. 50 km at the short
  // end and 250 km further out. Dragging snaps to it; arrow keys move by it.
  step: (value: number) => number;
  format: (value: number) => string;
};

// Positions along the track. Plenty for any snap step at either end.
const STEPS = 1000;

// The track is curved: value = max * t², so the short end, where most routes
// are, gets most of the room. Halfway along is a quarter of max.
function toValue(position: number, max: number, step: (value: number) => number) {
  if (position >= STEPS) return max;
  const raw = max * (position / STEPS) ** 2;
  const spacing = step(raw);
  return Math.min(max, Math.round(raw / spacing) * spacing);
}

const KEY_DIRECTIONS: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
};

function toPosition(value: number, max: number) {
  return Math.round(Math.sqrt(value / max) * STEPS);
}

// Two native range inputs stacked on one track, so each handle keeps the
// browser's own dragging, focus and screen-reader support.
function RangeSlider({ label, max, value, onCommit, step, format }: RangeSliderProps) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  const minInput = useRef<HTMLInputElement>(null);
  const maxInput = useRef<HTMLInputElement>(null);

  // Follow the committed value when it changes from outside (Clear), but not
  // on every parent render, which hands over an equal but new object.
  const [synced, setSynced] = useState(value);
  if (value.min !== synced.min || value.max !== synced.max) {
    setSynced(value);
    setDraft(value);
    draftRef.current = value;
  }

  // The native "change" event is the release; React's onChange is every step.
  useEffect(() => {
    const inputs = [minInput.current, maxInput.current];
    const commit = () => onCommit(draftRef.current);
    for (const input of inputs) input?.addEventListener("change", commit);
    return () => {
      for (const input of inputs) input?.removeEventListener("change", commit);
    };
  }, [onCommit]);

  function update(next: NumberRange) {
    draftRef.current = next;
    setDraft(next);
  }

  // Arrow keys move by one selectable value. Left to the browser, a key moves
  // one of STEPS positions, which near the far end of the curve is less than
  // the spacing, so snapping would put the handle straight back.
  function handleKeyDown(handle: keyof NumberRange, event: KeyboardEvent) {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();

    const current = draft[handle];
    const moved =
      direction > 0 ? current + step(current) : current - step(Math.max(0, current - 1));
    const next =
      handle === "min"
        ? { ...draft, min: Math.max(0, Math.min(moved, draft.max)) }
        : { ...draft, max: Math.min(max, Math.max(moved, draft.min)) };
    if (next[handle] === current) return;

    update(next);
    // No native change event follows a prevented keydown.
    onCommit(next);
  }

  const minPosition = toPosition(draft.min, max);
  const maxPosition = toPosition(draft.max, max);

  return (
    <div className="range-filter">
      <p className="range-filter-readout" aria-live="polite">
        {draft.min === draft.max
          ? format(draft.min)
          : `${format(draft.min)} – ${format(draft.max)}`}
      </p>

      <div className="range-slider">
        <div className="range-slider-track">
          <div
            className="range-slider-fill"
            style={{
              left: `${(minPosition / STEPS) * 100}%`,
              right: `${100 - (maxPosition / STEPS) * 100}%`,
            }}
          />
        </div>

        <input
          ref={minInput}
          type="range"
          min={0}
          max={STEPS}
          value={minPosition}
          aria-label={`Minimum ${label}`}
          aria-valuetext={format(draft.min)}
          // Where the handles overlap, the one on top must be the one that can
          // still move: the lower handle near the far end, the upper one
          // elsewhere. Otherwise both at 0 would leave only the lower handle,
          // which cannot pass the upper, under the cursor.
          style={{ zIndex: minPosition > STEPS / 2 ? 2 : 1 }}
          onKeyDown={(event) => handleKeyDown("min", event)}
          onChange={(event) =>
            update({
              ...draft,
              min: Math.min(toValue(Number(event.target.value), max, step), draft.max),
            })
          }
        />
        <input
          ref={maxInput}
          type="range"
          min={0}
          max={STEPS}
          value={maxPosition}
          aria-label={`Maximum ${label}`}
          aria-valuetext={format(draft.max)}
          style={{ zIndex: minPosition > STEPS / 2 ? 1 : 2 }}
          onKeyDown={(event) => handleKeyDown("max", event)}
          onChange={(event) =>
            update({
              ...draft,
              max: Math.max(toValue(Number(event.target.value), max, step), draft.min),
            })
          }
        />
      </div>

      <div className="range-filter-scale" aria-hidden="true">
        <span>{format(0)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

export default RangeSlider;
