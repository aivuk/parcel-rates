import { useEffect, useId, useState } from "react";
import type { Meta } from "../../api/types";
import type { Action, AppState } from "../../state/urlState";
import { fuelDefault, yearOptions } from "../../lib/fuel";
import { FuelSlider, fuelAbout } from "./FuelSlider";
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

function PriceInput({ value, aboutId, onCommit }: { value: number; aboutId: string; onCommit: (n: number) => void }) {
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
          aria-describedby={problem ? `${id}-error ${aboutId}` : aboutId}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      </div>
      {problem && (
        <p id={`${id}-error`} className="control__error">
          {problem}
        </p>
      )}
    </div>
  );
}

export function ControlRail({ state, dispatch, meta, metaStatus, onRetryMeta }: ControlRailProps) {
  const c = state.controls;
  const years = yearOptions(meta);
  const yearList = years.length > 0 ? years : [{ year: c.year, missing: [] }];
  const yearId = useId();
  const peakId = useId();
  const aboutId = useId();
  const about = {
    ground: `${aboutId}-ground`,
    express: `${aboutId}-express`,
    peak: `${aboutId}-peak`,
    price: `${aboutId}-price`,
  };
  const groundDefault = fuelDefault(meta, c.year, "ground");
  const expressDefault = fuelDefault(meta, c.year, "express");

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

      <fieldset className="control control--fuel">
        <legend className="control__label">Fuel surcharge, UPS and FedEx</legend>
        <FuelSlider
          group="ground"
          label="Ground"
          aboutId={about.ground}
          override={c.fuel_override_percent?.ground}
          defaultInfo={groundDefault}
          onChange={(percent) => dispatch({ type: "fuel", group: "ground", percent })}
          onReset={() => dispatch({ type: "fuelReset", group: "ground" })}
        />
        <FuelSlider
          group="express"
          label="Express"
          aboutId={about.express}
          override={c.fuel_override_percent?.express}
          defaultInfo={expressDefault}
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
          aria-describedby={about.peak}
          onChange={(e) => dispatch({ type: "peak", peak: e.target.checked })}
        />
        <label htmlFor={peakId} className="switch__label">
          Peak season surcharges
        </label>
      </div>

      <PriceInput value={c.flat_price} aboutId={about.price} onCommit={(price) => dispatch({ type: "price", price })} />

      {/* The explanations stay out of the flow: values are always visible, the prose is one
          disclosure away. Each control's aria-describedby still points at its line here. */}
      <details className="rail__about">
        <summary className="rail__about-summary">About these assumptions</summary>
        <dl className="rail__about-list">
          <dt>Fuel, ground</dt>
          <dd id={about.ground}>{fuelAbout("ground services", groundDefault)}</dd>
          <dt>Fuel, express</dt>
          <dd id={about.express}>{fuelAbout("2–3 day and next day", expressDefault)}</dd>
          <dt>Peak season</dt>
          <dd id={about.peak}>Prices as of December 10, inside every carrier's peak window.</dd>
          <dt>Flat price</dt>
          <dd id={about.price}>A price_charged column in your CSV overrides this per parcel.</dd>
        </dl>
      </details>
    </div>
  );
}
