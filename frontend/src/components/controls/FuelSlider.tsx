import { useId } from "react";
import type { FuelGroup } from "../../api/types";
import { FUEL_MAX, FUEL_MIN } from "../../state/urlState";
import type { FuelDefaultInfo } from "../../lib/fuel";
import { formatPercent } from "../../lib/format";

export interface FuelSliderProps {
  group: FuelGroup;
  label: string;
  /** Id of this slider's explanation in the rail's "About these assumptions" list. */
  aboutId: string;
  override: number | undefined;
  defaultInfo: FuelDefaultInfo | null;
  onChange: (percent: number) => void;
  onReset: () => void;
}

const STEP = 0.25;

export function FuelSlider({ group, label, aboutId, override, defaultInfo, onChange, onReset }: FuelSliderProps) {
  const id = useId();
  const value = override ?? defaultInfo?.percent ?? 0;
  const isOverridden = override !== undefined;
  const markerLeft = defaultInfo ? ((defaultInfo.percent - FUEL_MIN) / (FUEL_MAX - FUEL_MIN)) * 100 : null;

  return (
    <div className={`fuel ${isOverridden ? "fuel--overridden" : ""}`} data-group={group}>
      <div className="fuel__head">
        <label htmlFor={id} className="fuel__label">
          {label}
        </label>
        <output htmlFor={id} className="fuel__value">
          {formatPercent(value)}
        </output>
      </div>
      <div className="fuel__track">
        <input
          id={id}
          type="range"
          min={FUEL_MIN}
          max={FUEL_MAX}
          step={STEP}
          value={value}
          aria-describedby={`${id}-hint ${aboutId}`}
          aria-valuetext={`${formatPercent(value)}${isOverridden ? "" : ", the year's default"}`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {markerLeft !== null && (
          <span className="fuel__marker" style={{ left: `${markerLeft}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="fuel__foot" id={`${id}-hint`}>
        {defaultInfo ? <span>Default {formatPercent(defaultInfo.percent)}</span> : <span>No published default</span>}
        {isOverridden && (
          <button type="button" className="btn btn--quiet fuel__reset" onClick={onReset}>
            Reset<span className="visually-hidden"> {label.toLowerCase()} fuel to the default</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** The prose behind a fuel slider, shown in the rail's "About these assumptions" list. */
export function fuelAbout(hint: string, info: FuelDefaultInfo | null): string {
  if (!info) return `No published default for this year; ${hint}.`;
  const proxy = info.proxyCarriers.length > 0 ? "; UPS uses the FedEx history" : "";
  return `Year default ${formatPercent(info.percent)}, ${hint}${proxy}.`;
}
