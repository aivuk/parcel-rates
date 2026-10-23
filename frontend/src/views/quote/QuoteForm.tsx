import { useId, type ReactNode } from "react";
import type { Carrier, DeliveryArea, Parcel, Tier } from "../../api/types";
import { CARRIERS, TIERS } from "../../api/types";
import { CARRIER_NAME, TIER_NAME } from "../../lib/format";
import { draftFromParcel, draftWeight, type Draft } from "./draft";
import type { FormField } from "./quoteModel";

export interface QuoteFormProps {
  draft: Draft;
  onChange: (next: Draft) => void;
  /** Messages per field: local shape checks and the server's 422 messages. */
  errors: Partial<Record<FormField, string[]>>;
  /** Zone per carrier from the last quote, shown under the distance. */
  zones: Partial<Record<Carrier, number>> | null;
  parcels: Parcel[] | null;
}

const AREA_LABEL: Record<DeliveryArea, string> = {
  none: "Standard area",
  das: "Remote (DAS)",
  extended: "Extended remote",
};

function zoneLine(zones: Partial<Record<Carrier, number>>): string | null {
  const entries = CARRIERS.filter((c) => zones[c] !== undefined).map((c) => [c, zones[c]!] as const);
  if (entries.length === 0) return null;
  const distinct = new Set(entries.map(([, z]) => z));
  if (distinct.size === 1) return `Zone ${entries[0]![1]}${entries.length > 1 ? " for every carrier" : ` (${CARRIER_NAME[entries[0]![0]]})`}`;
  return entries.map(([c, z]) => `${CARRIER_NAME[c]} zone ${z}`).join(" · ");
}

function parcelLabel(p: Parcel, i: number): string {
  const dims = p.length_in ? ` · ${p.length_in}×${p.width_in}×${p.height_in} in` : "";
  return `#${i + 1}: ${p.weight_lb} lb${dims} · ${p.distance_miles} mi · ${p.residential ? "home" : "business"} · ${TIER_NAME[p.speed]}`;
}

const MAX_PICKS = 300;

function Errors({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} className="control__error qf__error">
      {messages.join(" ")}
    </p>
  );
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="qf__field">
      <label className="control__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

export function QuoteForm({ draft, onChange, errors, zones, parcels }: QuoteFormProps) {
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  /** Error wiring for every input of a field; compound fields (lb + oz, L × W × H) share one message. */
  const described = (field: FormField) => (errors[field]?.length ? { "aria-describedby": id(`${field}-err`), "aria-invalid": true } : {});
  const weight = draftWeight(draft);
  const ozUsed = draft.oz.trim() !== "" && weight !== null && !Number.isNaN(weight);
  const zoneText = zones ? zoneLine(zones) : null;

  return (
    <form className="qf" aria-label="Your parcel" onSubmit={(e) => e.preventDefault()}>
      <h3 className="kicker qf__title">Your parcel</h3>

      {parcels && parcels.length > 0 && (
        <Field label="Start from one of your parcels" htmlFor={id("pick")}>
          <select
            id={id("pick")}
            className="select"
            value=""
            onChange={(e) => {
              const p = parcels[Number(e.target.value)];
              if (p) onChange(draftFromParcel(p));
            }}
          >
            <option value="">Choose a parcel…</option>
            {parcels.slice(0, MAX_PICKS).map((p, i) => (
              <option key={i} value={i}>
                {parcelLabel(p, i)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <fieldset className="control qf__group">
        <legend className="control__label">Weight</legend>
        <div className="qf__pair">
          <label className="qf__unit">
            <input
              className="qf__input"
              inputMode="decimal"
              value={draft.lb}
              onChange={(e) => set("lb", e.target.value)}
              aria-label="Weight in pounds"
              {...described("weight")}
            />
            <span aria-hidden="true">lb</span>
          </label>
          <label className="qf__unit">
            <input
              className="qf__input"
              inputMode="decimal"
              value={draft.oz}
              onChange={(e) => set("oz", e.target.value)}
              aria-label="Plus ounces"
              {...described("weight")}
              placeholder="0"
            />
            <span aria-hidden="true">oz</span>
          </label>
        </div>
        <p className="control__hint">
          {ozUsed ? `= ${weight} lb. ` : ""}Ounces help for light parcels: USPS prices them in ounce steps under 1 lb.
        </p>
        <Errors id={id("weight-err")} messages={errors.weight} />
      </fieldset>

      <fieldset className="control qf__group">
        <legend className="control__label">
          Box size <span className="qf__optional">optional, inches</span>
        </legend>
        <div className="qf__dims">
          {(["length", "width", "height"] as const).map((k, i) => (
            <label key={k} className="qf__unit">
              <input
                className="qf__input"
                inputMode="decimal"
                value={draft[k]}
                onChange={(e) => set(k, e.target.value)}
                aria-label={`${k[0]!.toUpperCase()}${k.slice(1)} in inches`}
                {...described("dims")}
              />
              {i < 2 && <span aria-hidden="true">×</span>}
            </label>
          ))}
        </div>
        <p className="control__hint">Large light boxes are billed by size (dimensional weight).</p>
        <Errors id={id("dims-err")} messages={errors.dims} />
      </fieldset>

      <Field
        label="Distance"
        htmlFor={id("distance")}
        hint={
          <>
            {zoneText && (
              <p className="control__hint qf__zone" aria-live="polite">
                {zoneText}
              </p>
            )}
            <Errors id={id("distance-err")} messages={errors.distance} />
          </>
        }
      >
        <label className="qf__unit">
          <input
            id={id("distance")}
            className="qf__input"
            inputMode="decimal"
            value={draft.distance}
            onChange={(e) => set("distance", e.target.value)}
            {...described("distance")}
          />
          <span aria-hidden="true">miles</span>
        </label>
      </Field>

      <fieldset className="control qf__group">
        <legend className="control__label">Delivered to</legend>
        <div className="qf-seg qf-seg--2">
          {[
            [true, "A home"],
            [false, "A business"],
          ].map(([value, label]) => (
            <label key={String(value)} className="qf-seg__opt">
              <input
                type="radio"
                name={id("res")}
                checked={draft.residential === value}
                {...described("residential")}
                onChange={() => set("residential", value as boolean)}
              />
              <span>{label as string}</span>
            </label>
          ))}
        </div>
        <Errors id={id("residential-err")} messages={errors.residential} />
      </fieldset>

      <fieldset className="control qf__group">
        <legend className="control__label">Speed needed</legend>
        <div className="qf-seg qf-seg--3">
          {TIERS.map((t: Tier) => (
            <label key={t} className="qf-seg__opt">
              <input
                type="radio"
                name={id("speed")}
                checked={draft.speed === t}
                onChange={() => set("speed", t)}
                {...described("speed")}
              />
              <span>{TIER_NAME[t]}</span>
            </label>
          ))}
        </div>
        <Errors id={id("speed-err")} messages={errors.speed} />
      </fieldset>

      <Field label="Delivery area" htmlFor={id("area")} hint={<Errors id={id("delivery_area-err")} messages={errors.delivery_area} />}>
        <select
          id={id("area")}
          className="select"
          value={draft.area}
          onChange={(e) => set("area", e.target.value as DeliveryArea)}
          {...described("delivery_area")}
        >
          {(Object.keys(AREA_LABEL) as DeliveryArea[]).map((a) => (
            <option key={a} value={a}>
              {AREA_LABEL[a]}
            </option>
          ))}
        </select>
      </Field>

      <label className="qf__check">
        <input type="checkbox" checked={draft.nonstandard} onChange={(e) => set("nonstandard", e.target.checked)} />
        <span>
          Not a box
          <small>Tubes, bags or other nonstandard packaging</small>
        </span>
      </label>
      <Errors id={id("packaging-err")} messages={errors.packaging} />
    </form>
  );
}
