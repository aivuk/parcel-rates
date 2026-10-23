import { FullQuestion } from "./FullQuestion";
import { useId, useState } from "react";
import { useApi, useLoad } from "../api/ApiContext";
import type { BreakevenResponse, Carrier } from "../api/types";
import { CARRIERS } from "../api/types";
import { BreakevenTable } from "./breakeven/BreakevenTable";
import { Heatmap } from "./breakeven/Heatmap";
import { SAVING_LABELS, groundName, readout } from "./breakeven/readout";
import type { ViewProps } from "./types";
import "../styles/views.css";
import "./breakeven/breakeven.css";
import { CARRIER_NAME, carriersForYear, missingCarriersNote } from "../lib/carriers";

function Legend({ res, meta }: { res: BreakevenResponse; meta: ViewProps["meta"] }) {
  const winners = CARRIERS.filter((c) => res.cells.some((x) => x.winner?.carrier === c));
  return (
    <div className="hml" aria-label="Legend" role="group">
      <ul className="hml__carriers">
        {winners.map((c: Carrier) => (
          <li key={c}>
            <span className={`hml__sw hml__sw--${c}`} aria-hidden="true" />
            <strong>{CARRIER_NAME[c]}</strong> {groundName(meta, c, res.residential).replace(new RegExp(`^${CARRIER_NAME[c]} `), "")}{" "}
            cheapest
          </li>
        ))}
      </ul>
      <div className="hml__ramp">
        <span className="hml__ramplabel">Saving over the next cheapest:</span>
        <ol>
          {SAVING_LABELS.map((l, i) => (
            <li key={l}>
              <span className={`hml__step hml__step--${i}`} aria-hidden="true" />
              {l}
            </li>
          ))}
        </ol>
      </div>
      <p className="hml__note">A heavy line marks where USPS stops or starts winning; a dotted line where UPS and FedEx swap. Tap, hover or focus a cell for every price.</p>
    </div>
  );
}

export function BreakevenView({ controls, meta }: ViewProps) {
  const api = useApi();
  const [residential, setResidential] = useState(true);
  const [asTable, setAsTable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const uid = useId();
  const key = JSON.stringify({ controls, residential });
  const state = useLoad<BreakevenResponse>((signal) => api.breakeven({ controls, residential }, signal), [api, key, attempt]);

  const available = carriersForYear(meta, controls.year);
  const yearNote = missingCarriersNote(available, controls.year, CARRIER_NAME);
  const res = state.status === "ok" ? state.data : null;
  const r = res ? readout(res, meta) : null;

  return (
    <div className="bv">
      <fieldset className="bv__toggle">
        <legend className="visually-hidden">Delivered to</legend>
        <div className="qf-seg qf-seg--2">
          {[
            [true, "Homes"],
            [false, "Businesses"],
          ].map(([value, label]) => (
            <label key={String(value)} className="qf-seg__opt">
              <input type="radio" name={`${uid}-res`} checked={residential === value} onChange={() => setResidential(value as boolean)} />
              <span>{label as string}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {yearNote && (
        <p className="view-note" role="note">
          {yearNote}
        </p>
      )}

      {state.status === "error" ? (
        <div className="view-error" role="alert">
          <p className="view-error__title">The breakeven map could not be drawn.</p>
          <p>{state.error.message}</p>
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !res || !r ? (
        <div data-testid="breakeven-loading" aria-busy="true">
          <div className="answer">
            <p className="kicker">Where USPS stops winning</p>
            <p className="answer__figure skeleton skeleton--figure" aria-label="Loading…">
              00 lb
            </p>
            <p className="skeleton skeleton--line" aria-hidden="true" />
          </div>
          <div className="skeleton bv__skeleton-map" aria-hidden="true" />
        </div>
      ) : (
        <>
          <div className="answer bv__answer" aria-live="polite">
            <p className="kicker">Where USPS stops winning · {residential ? "home" : "business"} delivery</p>
            <p className="answer__figure" data-testid="breakeven-answer">
              {r.figure}
            </p>
            <p className="answer__caption bv__caption">{r.caption}</p>
            <FullQuestion id="breakeven" />
          </div>
          {r.lines.length > 0 && (
            <ul className="bv__lines" aria-label="Breakeven by distance">
              {r.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}

          {!r.noUsps && res.cells.length > 0 && (
            <section className="bv__map" aria-labelledby={`${uid}-map`}>
              <div className="bv__maphead">
                <h3 id={`${uid}-map`} className="bv__maptitle">
                  Cheapest ground service, {res.weights_lb[0]}–{res.weights_lb[res.weights_lb.length - 1]} lb by distance
                </h3>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={asTable}
                  aria-controls={`${uid}-table`}
                  onClick={() => setAsTable(!asTable)}
                >
                  {asTable ? "Show as map" : "Show as table"}
                </button>
              </div>
              <Legend res={res} meta={meta} />
              {asTable ? <BreakevenTable res={res} meta={meta} id={`${uid}-table`} /> : <Heatmap res={res} meta={meta} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}
