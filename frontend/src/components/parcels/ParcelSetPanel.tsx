import { useId, useMemo, useRef } from "react";
import { CSV_TEMPLATE } from "../../lib/parcelCsv";
import { summarize } from "../../lib/summary";
import type { ParcelSet, ParcelSetStatus } from "../../hooks/useParcelSet";
import { ParcelSummary } from "./ParcelSummary";

export interface ParcelSetPanelProps {
  set: ParcelSet | null;
  status: ParcelSetStatus;
  onLoadSample: () => void;
  onLoadFile: (file: File) => void;
  onClear: () => void;
}

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;
const MAX_LISTED = 12;

function Problems({ status }: { status: Extract<ParcelSetStatus, { kind: "error" | "notice" }> }) {
  const shown = status.problems.slice(0, MAX_LISTED);
  const rest = status.problems.length - shown.length;
  return (
    <div
      className={`problems ${status.kind === "error" ? "problems--error" : "problems--notice"}`}
      role={status.kind === "error" ? "alert" : "status"}
    >
      <p className="problems__title">{status.message}</p>
      {shown.length > 0 && (
        <ul className="problems__list">
          {shown.map((p, i) => (
            <li key={i}>
              <span className="problems__where">{p.row === null ? "File" : `Row ${p.row}`}</span>
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 && (
        <p className="problems__more">
          and {rest} more. Fix these first; the rest often share the same cause.
        </p>
      )}
    </div>
  );
}

export function ParcelSetPanel({ set, status, onLoadSample, onLoadFile, onClear }: ParcelSetPanelProps) {
  const fileId = useId();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const summary = useMemo(() => (set ? summarize(set.parcels) : null), [set]);
  const busy = status.kind === "loading";

  const actions = (
    <div className="parcels__actions">
      <button type="button" className="btn btn--primary" onClick={onLoadSample} disabled={busy}>
        {busy && status.what === "sample" ? "Loading sample…" : "Load sample mix"}
      </button>
      <input
        ref={inputRef}
        id={fileId}
        className="visually-hidden"
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoadFile(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <label htmlFor={fileId} className="btn file-btn">
        {busy && status.what === "file" ? "Reading file…" : "Upload CSV"}
      </label>
      <a className="btn btn--quiet" href={TEMPLATE_HREF} download="parcel-set-template.csv">
        CSV template
      </a>
    </div>
  );

  return (
    <section className="parcels" aria-labelledby={headingId} aria-busy={busy}>
      <header className="parcels__head">
        <div>
          <h2 id={headingId} className="parcels__title">
            Your parcels
          </h2>
          {set ? (
            <p className="parcels__source">
              {set.source === "sample" ? "Sample mix" : set.name}
              {set.description && <span> · {set.description}</span>}{" "}
              <button type="button" className="btn btn--quiet parcels__clear" onClick={onClear}>
                Clear
              </button>
            </p>
          ) : null}
        </div>
        {actions}
      </header>

      {(status.kind === "error" || status.kind === "notice") && <Problems status={status} />}

      {summary ? (
        <ParcelSummary summary={summary} />
      ) : (
        <div className="parcels__empty">
          <p className="parcels__empty-lead">No parcels loaded yet.</p>
          <p>
            Questions 3 and 4 price your whole mix. Load the sample to explore, or upload a CSV with one row per kind
            of parcel: weight, distance, home or business, speed, and how many you ship.
          </p>
        </div>
      )}
    </section>
  );
}
