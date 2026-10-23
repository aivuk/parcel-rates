import { useEffect, useId, useState } from "react";
import type { Meta } from "../../api/types";
import type { Action, AppState } from "../../state/urlState";
import { fuelDefault, yearOptions } from "../../lib/fuel";
import { FuelSlider, fuelAbout } from "./FuelSlider";
import { CARRIER_NAME } from "../../lib/carriers";
import { formatPercent, formatUsd, formatUsdRound } from "../../lib/format";
import { ORDER_VALUE_MAX, PRICE_MAX, ZIP5 } from "../../state/urlState";

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
  const free = c.free_shipping_over !== undefined ? `free from ${formatUsdRound(c.free_shipping_over)}` : null;
  return [String(c.year), c.origin_zip ? `from ${c.origin_zip}` : null, `USPS ${c.usps_rate_card}`, fuel, c.peak ? "peak" : null, `${formatUsd(c.flat_price)} charged`, free]
    .filter(Boolean)
    .join(" · ");
}

function ZipField({ value, aboutId, onCommit }: { value: string | null; aboutId: string; onCommit: (zip: string | null) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => {
    const zip = draft.trim();
    if (zip !== "" && !ZIP5.test(zip)) {
      setProblem("Enter a 5-digit ZIP code, or leave it empty");
      return;
    }
    setProblem(null);
    onCommit(zip === "" ? null : zip);
  };
  return (
    <div className="control">
      <label htmlFor={id} className="control__label">
        Ship from ZIP
      </label>
      <input
        id={id}
        className="select zip-input"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        placeholder="none"
        value={draft}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-error ${aboutId}` : aboutId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {problem && (
        <p id={`${id}-error`} className="control__error">
          {problem}
        </p>
      )}
    </div>
  );
}

interface MoneyFieldProps {
  label: string;
  /** Read after the label by screen readers only, to complete a short visible label. */
  labelRest?: string;
  /** null: empty, which `optional` fields accept as "no rule". */
  value: number | null;
  max: number;
  optional?: boolean;
  placeholder?: string;
  aboutId: string;
  onCommit: (n: number | null) => void;
}

function MoneyField({ label, labelRest, value, max, optional = false, placeholder, aboutId, onCommit }: MoneyFieldProps) {
  const id = useId();
  const shown = value === null ? "" : value.toFixed(2);
  const [draft, setDraft] = useState(shown);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setDraft(shown), [shown]);

  const commit = () => {
    const cleaned = draft.trim().replace(/^\$/, "").replace(/,/g, "");
    if (cleaned === "" && optional) {
      setProblem(null);
      onCommit(null);
      return;
    }
    const n = Number(cleaned);
    if (cleaned === "" || !Number.isFinite(n) || n < 0 || n > max) {
      setProblem(`Enter an amount between $0 and $${max.toLocaleString("en-US")}${optional ? ", or leave it empty" : ""}`);
      return;
    }
    setProblem(null);
    onCommit(Math.round(n * 100) / 100);
  };

  return (
    <div className="control">
      <label htmlFor={id} className="control__label">
        {label}
        {labelRest && <span className="visually-hidden"> {labelRest}</span>}
      </label>
      <div className={`money-input ${problem ? "money-input--invalid" : ""}`}>
        <span aria-hidden="true">$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          placeholder={placeholder}
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
    free: `${aboutId}-free`,
    from: `${aboutId}-from`,
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

      <div className="control control--where">
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
        <ZipField value={c.origin_zip ?? null} aboutId={about.from} onCommit={(zip) => dispatch({ type: "originZip", zip })} />
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

      <div className="control control--pricing">
        <MoneyField
          label="Flat price"
          labelRest="per parcel"
          value={c.flat_price}
          max={PRICE_MAX}
          aboutId={about.price}
          onCommit={(price) => price !== null && dispatch({ type: "price", price })}
        />
        <MoneyField
          label="Free shipping from"
          labelRest="order value"
          value={c.free_shipping_over ?? null}
          max={ORDER_VALUE_MAX}
          optional
          placeholder="off"
          aboutId={about.free}
          onCommit={(over) => dispatch({ type: "freeShipping", over })}
        />
      </div>

      {/* The explanations stay out of the flow: values are always visible, the prose is one
          disclosure away. Each control's aria-describedby still points at its line here. */}
      <details className="rail__about">
        <summary className="rail__about-summary">About these assumptions</summary>
        <dl className="rail__about-list">
          <dt>Ship from</dt>
          <dd id={about.from}>
            The ZIP code your parcels leave from. With a destination ZIP (in question 1, or a destination_zip column in
            your CSV), USPS uses its zone chart; UPS and FedEx zones are estimated from the distance between the two ZIPs.
            Leave it empty to work with distances.
          </dd>
          <dt>Fuel, ground</dt>
          <dd id={about.ground}>{fuelAbout("ground services", groundDefault)}</dd>
          <dt>Fuel, express</dt>
          <dd id={about.express}>{fuelAbout("2–3 day and next day", expressDefault)}</dd>
          <dt>Peak season</dt>
          <dd id={about.peak}>Prices as of December 10, inside every carrier's peak window.</dd>
          <dt>Flat price</dt>
          <dd id={about.price}>A price_charged column in your CSV overrides this per parcel.</dd>
          <dt>Free shipping</dt>
          <dd id={about.free}>
            Orders of this value or more pay nothing for shipping, whatever their price. It needs an order_value column
            in your CSV (the sample mix has one). Leave it empty for no such rule.
          </dd>
        </dl>
      </details>
    </div>
  );
}
