import { useId } from "react";
import type { SegmentFilter, Tier, WeightBand, ZoneBandLabel } from "../../api/types";
import { TIERS } from "../../api/types";
import { tierName } from "./money";

export interface ChipOption<T> {
  value: T;
  label: string;
}

/** A row of toggle chips that behaves like a radio group; "All" clears the dimension. */
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

const DEFAULT_WEIGHTS: WeightBand[] = ["≤1", "1–5", "5–10", "10–20", "20–70"];
const DEFAULT_ZONES: ZoneBandLabel[] = ["1–2", "3–4", "5–6", "7–8"];

export function SegmentChips({
  value,
  onChange,
  weightBands = DEFAULT_WEIGHTS,
  zoneBands = DEFAULT_ZONES,
}: {
  value: SegmentFilter;
  onChange: (next: SegmentFilter) => void;
  weightBands?: readonly string[];
  zoneBands?: readonly string[];
}) {
  const set = <K extends keyof SegmentFilter>(key: K, v: SegmentFilter[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="segments">
      <ChipGroup<WeightBand | null>
        legend="Weight"
        value={value.weight_band ?? null}
        onChange={(v) => set("weight_band", v)}
        options={[
          { value: null, label: "All" },
          ...weightBands.map((w) => ({ value: w as WeightBand, label: `${w} lb` })),
        ]}
      />
      <ChipGroup<ZoneBandLabel | null>
        legend="Distance (USPS zone)"
        value={value.zone_band ?? null}
        onChange={(v) => set("zone_band", v)}
        options={[
          { value: null, label: "All" },
          ...zoneBands.map((z) => ({ value: z as ZoneBandLabel, label: `Zones ${z}` })),
        ]}
      />
      <ChipGroup<boolean | null>
        legend="Address"
        value={value.residential ?? null}
        onChange={(v) => set("residential", v)}
        options={[
          { value: null, label: "All" },
          { value: true, label: "Homes" },
          { value: false, label: "Businesses" },
        ]}
      />
      <ChipGroup<Tier | null>
        legend="Speed"
        value={value.speed ?? null}
        onChange={(v) => set("speed", v)}
        options={[{ value: null, label: "All" }, ...TIERS.map((t) => ({ value: t, label: tierName(t) }))]}
      />
    </div>
  );
}

/** "1–5 lb · homes" for the answer kicker; empty when no segment is set. */
export function describeSegment(s: SegmentFilter | null): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.weight_band) parts.push(`${s.weight_band} lb`);
  if (s.zone_band) parts.push(`zones ${s.zone_band}`);
  if (s.residential != null) parts.push(s.residential ? "homes" : "businesses");
  if (s.speed) parts.push(tierName(s.speed).toLowerCase());
  return parts.join(" · ");
}
