import "../styles/chips.css";
import { useId } from "react";

export interface ChipOption<T> {
  value: T;
  label: string;
}

/** A row of toggle chips that behaves like a radio group; an "All" option usually clears the choice. */
export function ChipGroup<T>({
  legend,
  options,
  value,
  onChange,
  equals = (a, b) => a === b,
}: {
  legend: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  equals?: (a: T, b: T) => boolean;
}) {
  const id = useId();
  return (
    <div className="chips" role="group" aria-labelledby={id}>
      <span id={id} className="chips__legend">
        {legend}
      </span>
      <div className="chips__row">
        {options.map((o) => {
          const on = equals(o.value, value);
          return (
            <button
              key={o.label}
              type="button"
              className={`chip ${on ? "chip--on" : ""}`}
              aria-pressed={on}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
