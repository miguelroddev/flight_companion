import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type FilterDropdownProps = {
  label: string;
  // Shown on the button while the filter is in use; null when it is not.
  summary: string | null;
  onClear: () => void;
  children: ReactNode;
};

// A button in the filter bar that opens the filter's controls beneath it.
function FilterDropdown({ label, summary, onClear, children }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Closes on a press anywhere outside, map included, and on Escape.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const active = summary !== null;

  return (
    <div className="filter-dropdown" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="filter-dropdown-button"
        data-active={active}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {/* The summary sits under the label, so a long one ("1,500 km – 4,000
            km") widens the button less than it would beside it. */}
        <span className="filter-dropdown-text">
          <span>{label}</span>
          {active && <span className="filter-dropdown-summary">{summary}</span>}
        </span>
        <span className="filter-dropdown-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="filter-dropdown-panel">
          {children}

          {active && (
            <button type="button" className="filter-dropdown-clear" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default FilterDropdown;
