import { FullQuestion } from "../FullQuestion";
import { useEffect, useId, useMemo, useState } from "react";
import { useApi, useLoad } from "../../api/ApiContext";
import type { Carrier, Meta, Parcel, YearlyResponse } from "../../api/types";
import type { ControlsState } from "../../state/urlState";
import { ChipGroup } from "../../components/ChipGroup";
import { LoadProblem } from "../../components/LoadProblem";
import { NeedParcels, type ParcelActions } from "../../components/NeedParcels";
import { useDebounced } from "../../hooks/useDebounced";
import { useLastData } from "../../hooks/useLastData";
import { carrierName, carrierVar } from "../../lib/carriers";
import { formatInt, formatUsd, signedPct, signedUsd } from "../../lib/format";
import { totalQuantity } from "../blended/logic";
import { YearChart } from "./YearChart";
import { DriverChart } from "./DriverChart";
import {
  DIMENSIONS,
  DIMENSION_LABEL,
  defaultIncrease,
  periodChange,
  pickCarrier,
  pointNotes,
  referenceYear,
  strongestDimension,
  type Dimension,
  type PointNote,
} from "./logic";

export interface YearlyPanelProps extends ParcelActions {
  controls: ControlsState;
  meta: Meta | null;
  parcels: Parcel[] | null;
}

export const INCREASE_MIN = -10;
export const INCREASE_MAX = 20;

export function YearlyPanel({ controls, parcels, onLoadSample, onUploadCsv }: YearlyPanelProps) {
  if (!parcels || parcels.length === 0) {
    return (
      <NeedParcels
        what="Load the sample mix or upload a CSV to see how the cost of your parcels moved under each year's published prices, against the increases the carriers announced, and which parcels drove it."
        onLoadSample={onLoadSample}
        onUploadCsv={onUploadCsv}
      />
    );
  }
  return <Yearly controls={controls} parcels={parcels} />;
}

function Yearly({ controls, parcels }: { controls: ControlsState; parcels: Parcel[] }) {
  const api = useApi();
  const [increase, setIncrease] = useState<number | null>(null);
  // false: each carrier's announced increase where it has one, the slider for the others; true: the slider for all.
  const [override, setOverride] = useState(false);
  const sent = useDebounced(increase, 250);
  const sentOverride = useDebounced(override, 250);
  const controlsKey = JSON.stringify(controls);
  const state = useLoad(
    (signal) =>
      api.yearly(
        {
          parcels,
          controls,
          ...(sent !== null ? { next_year_increase_percent: sent, next_year_override: sentOverride } : {}),
        },
        signal,
      ),
    [api, parcels, controlsKey, sent, sentOverride],
  );
  const data = useLastData(state);
  const total = useMemo(() => totalQuantity(parcels), [parcels]);

  // The slider starts at the pick carrier's latest announced increase, which the first answer tells us.
  useEffect(() => {
    if (increase !== null || !data) return;
    const ref = referenceYear(data);
    const d = ref !== null ? defaultIncrease(pickCarrier(data, ref)) : null;
    if (d !== null) setIncrease(d);
  }, [data, increase]);

  const loading = state.status === "loading";
  return (
    <div className="q4" aria-busy={loading}>
      {state.status === "error" && <LoadProblem error={state.error} />}
      {!data && loading && <p className="q-loading">Pricing {formatInt(total)} parcels under every year’s prices…</p>}
      {data && (
        <Body
          data={data}
          increase={increase}
          override={override}
          onIncrease={(v) => {
            setIncrease(v);
            setOverride(true);
          }}
          onReset={(v) => {
            setIncrease(v);
            setOverride(false);
          }}
          stale={loading}
        />
      )}
    </div>
  );
}

function Body({
  data,
  increase,
  override,
  onIncrease,
  onReset,
  stale,
}: {
  data: YearlyResponse;
  increase: number | null;
  override: boolean;
  onIncrease: (v: number) => void;
  onReset: (v: number) => void;
  stale: boolean;
}) {
  const ref = referenceYear(data);
  const pick = ref !== null ? pickCarrier(data, ref) : null;
  const notes = pointNotes(data);
  if (!pick || ref === null) {
    return <p className="q-loading">No carrier could price these parcels in every year.</p>;
  }
  const change = periodChange(pick, ref);
  const others = data.carriers
    .filter((c) => c.carrier !== pick.carrier && c.parcels_used > 0)
    .map((c) => ({ c, ch: periodChange(c, ref) }))
    .filter((x) => x.ch !== null);

  return (
    <div className={stale ? "is-stale" : undefined}>
      <div className="answer q4-answer">
        <p className="kicker">
          {carrierName(pick.carrier)}, your cheapest carrier in {ref} · {formatInt(pick.parcels_used)} parcels
          {change && (
            <>
              {" "}
              · <span className="q4-since">change since {change.fromYear}</span>
            </>
          )}
        </p>
        {change ? (
          <>
            <p className="answer__figure answer__figure--stamp" data-testid="q4-answer">
              <span className="carrier-tag" style={{ backgroundColor: carrierVar(pick.carrier) }}>
                {carrierName(pick.carrier)}
              </span>{" "}
              {signedPct(change.percent)}
            </p>
            <p className="answer__caption" data-testid="q4-caption">
              {formatUsd(change.from)} → {formatUsd(change.to)} per parcel from {change.fromYear} to {change.toYear} (
              {signedUsd(change.dollars)}).{" "}
              {change.announcedPercent !== null ? (
                <>
                  The increases {carrierName(pick.carrier)} announced compound to{" "}
                  <strong>{signedPct(change.announcedPercent)}</strong> over the same years, so your mix rose{" "}
                  <strong>
                    {Math.abs(change.percent - change.announcedPercent).toFixed(1)} points{" "}
                    {change.percent >= change.announcedPercent ? "more" : "less"}
                  </strong>{" "}
                  than announced.
                </>
              ) : (
                <>No announced increase is recorded for every year, so there is nothing to compare against.</>
              )}
            </p>
            {others.length > 0 && (
              <p className="q4-others">
                Same years for the others:{" "}
                {others.map(({ c, ch }, i) => (
                  <span key={c.carrier}>
                    {i > 0 && " · "}
                    <strong style={{ color: carrierVar(c.carrier) }}>{carrierName(c.carrier)}</strong> {signedPct(ch!.percent)}
                    {ch!.announcedPercent !== null && <> (announced {signedPct(ch!.announcedPercent)})</>}
                  </span>
                ))}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="answer__figure answer__figure--stamp" data-testid="q4-single-year">
              <span className="carrier-tag" style={{ backgroundColor: carrierVar(pick.carrier) }}>
                {carrierName(pick.carrier)}
              </span>{" "}
              {formatUsd(rowCost(pick, ref))}
              <span className="answer__unit"> per parcel</span>
            </p>
            <p className="answer__caption" data-testid="q4-single-year-caption">
              Only one year of {carrierName(pick.carrier)} prices ({ref}) can be compared for these parcels, so there is no
              change to show yet.
            </p>
          </>
        )}
        <FullQuestion id="yearly" />
      </div>

      <NextYear data={data} pick={pick.carrier} increase={increase} override={override} onIncrease={onIncrease} onReset={onReset} />

      <YearChart data={data} notes={notes} />
      <Notes notes={notes} />
      <Drivers data={data} defaultCarrier={pick.carrier} refYear={ref} />
      <Excluded data={data} />
    </div>
  );
}

const rowCost = (c: YearlyResponse["carriers"][number], y: number) => c.years.find((r) => r.year === y)?.cost_per_parcel ?? 0;

const BASIS_WORD = { announced: "announced", assumed: "assumed", override: "your override" } as const;

function NextYear({
  data,
  pick,
  increase,
  override,
  onIncrease,
  onReset,
}: {
  data: YearlyResponse;
  pick: Carrier;
  increase: number | null;
  override: boolean;
  onIncrease: (v: number) => void;
  onReset: (v: number) => void;
}) {
  const id = useId();
  const c = data.carriers.find((x) => x.carrier === pick)!;
  const last = c.years[c.years.length - 1]!;
  const projected = c.projected;
  const year = projected?.year ?? last.year + 1;
  const assumption = defaultIncrease(c);
  const announced = projected?.announced_percent ?? null;
  // The slider shows the pick carrier's own figure until the owner moves it.
  const value = !override && announced !== null ? announced : (increase ?? assumption ?? 0);
  const resetTo = announced ?? assumption;
  const local = Math.round(last.cost_per_parcel * (1 + value / 100) * 100) / 100;
  const shown = projected && projected.increase_percent === value ? projected.cost_per_parcel : local;
  const projectedCarriers = data.carriers.filter((x) => x.projected && x.parcels_used > 0);
  return (
    <section className="next-year" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="q-block__title">
        Next year, {year}
      </h3>
      <div className="next-year__row">
        <div className="next-year__control">
          <div className="next-year__head">
            <label htmlFor={id}>Increase for {year}</label>
            <output htmlFor={id} className="next-year__value">
              {signedPct(value)}
            </output>
          </div>
          <input
            id={id}
            type="range"
            min={INCREASE_MIN}
            max={INCREASE_MAX}
            step={0.1}
            value={value}
            aria-describedby={`${id}-hint`}
            aria-valuetext={signedPct(value)}
            onChange={(e) => onIncrease(Number(e.target.value))}
          />
          <p id={`${id}-hint`} className="next-year__hint">
            {override ? (
              <>Your override, applied to every carrier. </>
            ) : announced !== null ? (
              <>
                {carrierName(pick)} announced {signedPct(announced)} for {year}. Moving the slider overrides every carrier.{" "}
              </>
            ) : assumption !== null ? (
              <>
                {carrierName(pick)} has not announced its {year} increase; the slider assumes its latest announced increase,{" "}
                {signedPct(assumption)}, for every carrier without an announcement.{" "}
              </>
            ) : (
              <>No announced increase recorded to start from. </>
            )}
            {override && resetTo !== null && (
              <button type="button" className="btn btn--quiet next-year__reset" onClick={() => onReset(resetTo)}>
                Reset to {signedPct(resetTo)}
              </button>
            )}
          </p>
        </div>
        <div className="next-year__result">
          <p data-testid="q4-projection">
            <span className="figure next-year__figure" style={{ color: carrierVar(pick) }}>
              {formatUsd(shown)}
            </span>{" "}
            per parcel with {carrierName(pick)} in {year}, from {formatUsd(last.cost_per_parcel)} in {last.year} (
            {signedUsd(shown - last.cost_per_parcel)}).
          </p>
          {projectedCarriers.length > 0 && (
            <p className="next-year__basis" data-testid="q4-projection-basis">
              Each carrier’s next year, dotted in the chart:{" "}
              {projectedCarriers.map((x, i) => (
                <span key={x.carrier}>
                  {i > 0 && " · "}
                  <strong style={{ color: carrierVar(x.carrier) }}>{carrierName(x.carrier)}</strong> {x.projected!.year}{" "}
                  {signedPct(x.projected!.increase_percent)} {BASIS_WORD[x.projected!.basis]}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Notes({ notes }: { notes: PointNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="q-notes point-notes" data-testid="point-notes">
      <p className="kicker">Notes on the points marked !</p>
      <ul>
        {notes.map((n, i) => (
          <li key={i} className={`point-notes__item point-notes__item--${n.kind}`}>
            <strong style={{ color: carrierVar(n.carrier) }}>
              {carrierName(n.carrier)} {n.year}
            </strong>
            {n.kind === "warning" ? " (incomplete data): " : ": "}
            {n.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Drivers({ data, defaultCarrier, refYear }: { data: YearlyResponse; defaultCarrier: Carrier; refYear: number }) {
  const withDrivers = data.carriers.filter((c) => c.years.some((y) => y.drivers));
  const [carrier, setCarrier] = useState<Carrier>(defaultCarrier);
  const c = withDrivers.find((x) => x.carrier === carrier) ?? withDrivers[0];
  const steps = c ? c.years.filter((y) => y.drivers && y.change_vs_previous) : [];
  const defaultTo = [...steps].reverse().find((y) => y.year <= refYear)?.year ?? steps.at(-1)?.year;
  const [toYear, setToYear] = useState<number | undefined>(defaultTo);
  const row = steps.find((y) => y.year === toYear) ?? steps.find((y) => y.year === defaultTo);
  const [dim, setDim] = useState<Dimension | null>(null);
  if (!c || !row || !row.drivers) return null;
  const activeDim = dim ?? strongestDimension(row.drivers);

  return (
    <section className="q-block drivers" aria-label="What drove the change">
      <div className="q-block__head">
        <h3 className="q-block__title">Which parcels drove the change?</h3>
      </div>
      <div className="segments">
        <ChipGroup<Carrier>
          legend="Carrier"
          value={c.carrier}
          onChange={(v) => {
            setCarrier(v);
            setToYear(undefined);
          }}
          options={withDrivers.map((x) => ({ value: x.carrier, label: carrierName(x.carrier) }))}
        />
        <ChipGroup<number>
          legend="Between"
          value={row.year}
          onChange={setToYear}
          options={steps.map((y) => ({ value: y.year, label: `${y.change_vs_previous!.from_year}→${y.year}` }))}
        />
        <ChipGroup<Dimension>
          legend="Split by"
          value={activeDim}
          onChange={setDim}
          options={DIMENSIONS.map((d) => ({ value: d, label: DIMENSION_LABEL[d] }))}
        />
      </div>
      <DriverChart carrier={c.carrier} row={row} dim={activeDim} />
    </section>
  );
}

function Excluded({ data }: { data: YearlyResponse }) {
  const ex = data.carriers.filter((c) => c.parcels_excluded > 0);
  if (ex.length === 0) return null;
  return (
    <div className="q-notes" role="note">
      <p className="kicker">Parcels left out of the comparison</p>
      <ul>
        {ex.map((c) => (
          <li key={c.carrier}>
            <strong style={{ color: carrierVar(c.carrier) }}>{carrierName(c.carrier)}</strong>:{" "}
            {formatInt(c.parcels_excluded)} parcels it cannot ship in every year are left out, so its years compare the
            same {formatInt(c.parcels_used)} parcels.
          </li>
        ))}
      </ul>
    </div>
  );
}
