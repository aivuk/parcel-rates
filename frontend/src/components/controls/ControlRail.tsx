import { useEffect, useId, useState } from "react";
import type { Meta } from "../../api/types";
import type { Action, AppState } from "../../state/urlState";
import { fuelDefault, yearOptions } from "../../lib/fuel";
import { FuelSlider } from "./FuelSlider";
import { CARRIER_NAME } from "../../lib/carriers";
import { formatPercent, formatUsd } from "../../lib/format";

export interface ControlRailProps {
  state: AppState;
  dispatch: (a: Action) => void;
  meta: Meta | null;
  metaStatus: "loading" | "ok" | "error" | "idle";
  onRetryMeta: () => void;
}

/** One-line summary of the assumptions, shown in the mobile bar. */
export function assumptionsLine(state: AppState): string {
  const c = state.controls;
  const o = c.fuel_override_percent;
  const fuel = o
    ? `fuel ${[o.ground, o.express].map((v) => (v === undefined ? "default" : formatPercent(v))).join(" / ")}`
    : "fuel default";
  return [String(c.year), `USPS ${c.usps_rate_card}`, fuel, c.peak ? "peak" : null, `${formatUsd(c.flat_price)} charged`]
    .filter(Boolean)
    .join(" · ");
}

function PriceInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(value.toFixed(2));
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setDraft(value.toFixed(2)), [value]);

  const commit = () => {
    const cleaned = draft.trim().replace(/^\$/, "");
    const n = Number(cleaned);
    if (cleaned === "" || !Number.isFinite(n) || n < 0 || n > 1000) {
      setProblem("Enter a price between $0 and $1,000");
      return;
    }
    setProblem(null);
    onCommit(Math.round(n * 100) / 100);
  };

  return (
    <div className="control">
      <label htmlFor={id} className="control__label">
        Flat price you charge per parcel
      </label>
      <div className={`money-input ${problem ? "money-input--invalid" : ""}`}>
        <span aria-hidden="true">$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      </div>
      <p id={`${id}-hint`} className={problem ? "control__error" : "control__hint"}>
        {problem ?? "A price_charged column in your CSV overrides this per parcel."}
      </p>
    </div>
  );
}

export function ControlRail({ state, dispatch, meta, metaStatus, onRetryMeta }: ControlRailProps) {
  const c = state.controls;
  const years = yearOptions(meta);
  const yearList = years.length > 0 ? years : [{ year: c.year, missing: [] }];
  const yearId = useId();
  const peakId = useId();

  return (
    <div className="rail__body">
      {metaStatus === "loading" && (
        <p className="rail__status" role="status">
          <span className="pulse" aria-hidden="true" /> Loading price lists…
        </p>
      )}
      {metaStatus === "error" && (
        <div className="rail__status rail__status--error" role="alert">
          <p>Price lists did not load. The controls use built-in defaults until the rate service answers.</p>
          <button type="button" className="btn" onClick={onRetryMeta}>
            Try again
          </button>
        </div>
      )}

      <div className="control">
        <label htmlFor={yearId} className="control__label">
          Price list year
        </label>
        <select
          id={yearId}
          className="select"
          value={c.year}
          onChange={(e) => dispatch({ type: "year", year: Number(e.target.value) })}
        >
          {yearList.map(({ year, missing }) => (
            <option key={year} value={year}>
              {year}
              {missing.length > 0 ? ` (no ${missing.map((m) => CARRIER_NAME[m]).join(", ")})` : ""}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="control segmented">
        <legend className="control__label">USPS prices</legend>
        <div className="segmented__options">
          {(
            [
              ["commercial", "Commercial", "online postage"],
              ["retail", "Retail", "Post Office counter"],
            ] as const
          ).map(([value, label, note]) => (
            <label key={value} className="segmented__option">
              <input
                type="radio"
                name="usps-rate-card"
                value={value}
                checked={c.usps_rate_card === value}
                onChange={() => dispatch({ type: "card", card: value })}
              />
              <span className="segmented__text">
                {label}
                <small>{note}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="control">
        <legend className="control__label">Fuel surcharge, UPS and FedEx</legend>
        <FuelSlider
          group="ground"
          label="Ground"
          hint="ground services"
          override={c.fuel_override_percent?.ground}
          defaultInfo={fuelDefault(meta, c.year, "ground")}
          onChange={(percent) => dispatch({ type: "fuel", group: "ground", percent })}
          onReset={() => dispatch({ type: "fuelReset", group: "ground" })}
        />
        <FuelSlider
          group="express"
          label="Express"
          hint="2–3 day and next day"
          override={c.fuel_override_percent?.express}
          defaultInfo={fuelDefault(meta, c.year, "express")}
          onChange={(percent) => dispatch({ type: "fuel", group: "express", percent })}
          onReset={() => dispatch({ type: "fuelReset", group: "express" })}
        />
      </fieldset>

      <div className="control switch">
        <input
          id={peakId}
          type="checkbox"
          role="switch"
          checked={c.peak}
          aria-describedby={`${peakId}-hint`}
          onChange={(e) => dispatch({ type: "peak", peak: e.target.checked })}
        />
        <label htmlFor={peakId} className="switch__label">
          Peak season surcharges
        </label>
        <p id={`${peakId}-hint`} className="control__hint switch__hint">
          Prices as of December 10, inside every carrier's peak window.
        </p>
      </div>

      <PriceInput value={c.flat_price} onCommit={(price) => dispatch({ type: "price", price })} />
    </div>
  );
}
