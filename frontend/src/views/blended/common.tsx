import "./common.css";
/**
 * Pieces shared by the Q3 (blended) and Q4 (yearly) views: the empty state, the
 * chart frame with its text summary and table alternative, resolved CSS colours for
 * Recharts, and a loader that keeps the previous answer on screen while re-querying.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import type { Loadable } from "../../api/ApiContext";
import { ApiError } from "../../api/client";

/* ---------- empty state ---------- */

export interface ParcelActions {
  /** Load the bundled sample mix (App's parcel-set handler), when the host passes it. */
  onLoadSample?: () => void;
  /** Open the CSV file picker, when the host passes it. */
  onUploadCsv?: () => void;
}

/**
 * ViewProps carries no parcel-set handlers, so without explicit ones the buttons drive the
 * "Your parcels" panel above (its sample button and file input): one set of handlers, one
 * place where errors are shown.
 */
function panelSampleButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".parcels button"));
  return buttons.find((b) => /sample mix/i.test(b.textContent ?? "")) ?? null;
}

function panelFileInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.parcels input[type="file"]');
}

export function NeedParcels({ what, onLoadSample, onUploadCsv }: { what: string } & ParcelActions) {
  const loadSample = onLoadSample ?? (() => panelSampleButton()?.click());
  const upload = onUploadCsv ?? (() => panelFileInput()?.click());
  return (
    <div className="need-parcels" data-testid="need-parcels">
      <p className="need-parcels__lead">This question prices your whole mix of parcels.</p>
      <p className="need-parcels__text">{what}</p>
      <div className="need-parcels__actions">
        <button type="button" className="btn btn--primary" onClick={loadSample}>
          Load the sample mix
        </button>
        <button type="button" className="btn" onClick={upload}>
          Upload CSV
        </button>
      </div>
    </div>
  );
}

/* ---------- chart frame: title, text summary, chart or table ---------- */

export function ChartFrame({
  title,
  summary,
  chart,
  table,
  aside,
}: {
  title: string;
  summary: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  aside?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  return (
    <figure className="chart" aria-labelledby={titleId}>
      <div className="chart__head">
        <h3 id={titleId} className="chart__title">
          {title}
        </h3>
        <button
          type="button"
          className="btn btn--quiet chart__toggle"
          aria-controls={bodyId}
          aria-pressed={asTable}
          onClick={() => setAsTable((t) => !t)}
        >
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
      <figcaption className="chart__summary">{summary}</figcaption>
      <div id={bodyId} className="chart__body">
        {asTable ? <div className="chart__table-wrap">{table}</div> : <div aria-hidden="true">{chart}</div>}
      </div>
      {aside}
    </figure>
  );
}

/* ---------- colours for Recharts ---------- */

const DARK = "(prefers-color-scheme: dark)";

/** Resolve CSS custom properties to concrete colours; re-resolves when the colour scheme flips. */
export function useCssColors<K extends string>(vars: Record<K, string>): Record<K, string> {
  const read = () => {
    const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const out = {} as Record<K, string>;
    for (const k in vars) out[k] = style?.getPropertyValue(vars[k]).trim() || "currentColor";
    return out;
  };
  const [colors, setColors] = useState(read);
  const key = JSON.stringify(vars);
  useEffect(() => {
    setColors(read());
    const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DARK) : null;
    if (!mq) return;
    const onChange = () => setColors(read());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return colors;
}

/* ---------- loading that keeps the last answer ---------- */

/** The latest successful data, so controls re-query without blanking the view. */
export function useLastData<T>(state: Loadable<T>): T | null {
  const [last, setLast] = useState<T | null>(state.status === "ok" ? state.data : null);
  useEffect(() => {
    if (state.status === "ok") setLast(state.data);
  }, [state]);
  return state.status === "ok" ? state.data : last;
}

export function LoadProblem({ error }: { error: Error }) {
  const problems = error instanceof ApiError ? error.problems : [];
  return (
    <div className="problems problems--error" role="alert">
      <p className="problems__title">{error.message}</p>
      {problems.length > 0 && (
        <ul className="problems__list">
          {problems.slice(0, 8).map((p, i) => (
            <li key={i}>
              {p.field && <span className="problems__where">{p.field}</span>}
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Debounce a fast-changing value (slider) before it reaches the API. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
