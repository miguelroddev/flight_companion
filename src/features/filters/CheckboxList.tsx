type CheckboxListProps<T extends string> = {
  options: readonly { id: T; label: string }[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
};

function CheckboxList<T extends string>({
  options,
  selected,
  onChange,
}: CheckboxListProps<T>) {
  function toggle(id: T) {
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }

  return options.map((option) => (
    <label key={option.id} className="filter-dropdown-option">
      <input
        type="checkbox"
        checked={selected.includes(option.id)}
        onChange={() => toggle(option.id)}
      />
      {option.label}
    </label>
  ));
}

export default CheckboxList;
