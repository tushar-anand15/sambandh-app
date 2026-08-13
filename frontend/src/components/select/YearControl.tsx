/**
 * The third of the three selections: a financial year, or an election cycle.
 *
 * It is one component rather than two because the difference between a year
 * and a cycle is what the options say, not how the reader picks one. Both are
 * a labelled `<select>` whose value is a URL segment; keeping them together
 * means Finances, Meetings and Elections cannot drift into three slightly
 * different controls.
 *
 * The component holds no state. Its value comes from the URL and its onChange
 * writes back to the URL — see `BodySelector`.
 */

export interface YearOption {
  /** The URL segment: "2023-2024" for a year, "2025" for a cycle. */
  value: string;
  /** What the reader sees: "2023–24", "2025". */
  label: string;
  /**
   * A qualifier shown after the label, e.g. "in progress" for the open
   * financial year. It travels with the option because 2025-26 must never sit
   * beside a closed year without saying so.
   */
  note?: string;
  /**
   * The selected body has no record for this year, so choosing it could only
   * produce a page explaining an absence. The option stays in the list and
   * stays unselectable: removing it would leave a reader unable to see that
   * the year exists and that this body has nothing in it.
   */
  unavailable?: boolean;
}

interface YearControlProps {
  id: string;
  /** "Financial year" or "Election cycle". */
  label: string;
  options: YearOption[];
  /** The selected value, or "" for none chosen yet. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown as the empty option — states what choosing does, not "Select…". */
  placeholder: string;
}

/**
 * "2023-2024" reads as "2023–24", with an en dash and no repeated century.
 * Anything that is not a four-four year label passes through untouched: a
 * cycle is already the string a reader wants.
 */
export function formatYearLabel(value: string): string {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  if (!match) return value;
  return `${match[1]}–${match[2].slice(2)}`;
}

export default function YearControl({
  id,
  label,
  options,
  value,
  onChange,
  disabled = false,
  placeholder,
}: YearControlProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="field-select"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.unavailable}
          >
            {option.note ? `${option.label} (${option.note})` : option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
