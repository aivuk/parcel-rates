import { useId } from "react";
import type { FuelGroup } from "../../api/types";
import { FUEL_MAX, FUEL_MIN } from "../../state/urlState";
import type { FuelDefaultInfo } from "../../lib/fuel";
import { formatPercent } from "../../lib/format";

export interface FuelSliderProps {
  group: FuelGroup;
  label: string;
  hint: string;
  override: number | undefined;
  defaultInfo: FuelDefaultInfo | null;
  onChange: (percent: number) => void;
  onReset: () => void;
}

const STEP = 0.25;

export function FuelSlider({ group, label, hint, override, defaultInfo, onChange, onReset }: FuelSliderProps) {
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
          aria-describedby={`${id}-hint`}
          aria-valuetext={`${formatPercent(value)}${isOverridden ? "" : ", the year's default"}`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {markerLeft !== null && (
          <span className="fuel__marker" style={{ left: `${markerLeft}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="fuel__foot" id={`${id}-hint`}>
        {defaultInfo ? (
          <span>
            Year default {formatPercent(defaultInfo.percent)}, {hint}
            {defaultInfo.proxyCarriers.length > 0 && "; UPS uses the FedEx history"}
          </span>
        ) : (
          <span>No published default for this year</span>
        )}
        {isOverridden && (
          <button type="button" className="btn btn--quiet fuel__reset" onClick={onReset}>
            Reset<span className="visually-hidden"> {label.toLowerCase()} fuel to the default</span>
          </button>
        )}
      </div>
    </div>
  );
}
