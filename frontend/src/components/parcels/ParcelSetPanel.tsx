import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ZoneBand } from "../../api/types";
import { TIERS } from "../../api/types";
import { CSV_TEMPLATE } from "../../lib/parcelCsv";
import { summarize, type ParcelSummary as Summary } from "../../lib/summary";
import { TIER_NAME, formatInt, formatShare } from "../../lib/format";
import type { ParcelSet, ParcelSetStatus } from "../../hooks/useParcelSet";
import { ParcelSummary } from "./ParcelSummary";

export interface ParcelSetPanelProps {
  set: ParcelSet | null;
  status: ParcelSetStatus;
  /** Zone bands from /api/meta; the USPS ones bucket the distance distribution. */
  zoneBands?: ZoneBand[];
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
      {rest > 0 && <p className="problems__more">and {rest} more. Fix these first; the rest often share the same cause.</p>}
    </div>
  );
}

/** One line: count, share to homes, speed split. */
function StripFacts({ summary }: { summary: Summary }) {
  return (
    <p className="strip__facts">
      <span className="strip__count">
        <span className="figure">{formatInt(summary.parcels)}</span> parcels
      </span>
      <span>{formatShare(summary.residentialShare)} to homes</span>
      <span>
        {TIERS.filter((t) => summary.byTier[t] > 0)
          .map((t) => `${formatShare(summary.byTier[t])} ${TIER_NAME[t].toLowerCase()}`)
          .join(" · ")}
      </span>
    </p>
  );
}

export function ParcelSetPanel({ set, status, zoneBands, onLoadSample, onLoadFile, onClear }: ParcelSetPanelProps) {
  const fileId = useId();
  const headingId = useId();
  const detailsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const summary = useMemo(() => (set ? summarize(set.parcels, zoneBands) : null), [set, zoneBands]);
  const busy = status.kind === "loading";
  const [expanded, setExpanded] = useState(false);

  // A newly loaded set starts collapsed, so the questions stay above the fold.
  useEffect(() => setExpanded(false), [set]);

  const fileInput = (
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
  );
  const uploadLabel = (text: string) => (
    <label htmlFor={fileId} className="btn file-btn">
      {busy && status.what === "file" ? "Reading file…" : text}
    </label>
  );
  const sampleButton = (
    <button type="button" className={`btn ${set ? "" : "btn--primary"}`} onClick={onLoadSample} disabled={busy}>
      {busy && status.what === "sample" ? "Loading sample…" : set ? "Use the sample mix" : "Load sample mix"}
    </button>
  );
  const templateLink = (
    <a className="btn btn--quiet" href={TEMPLATE_HREF} download="parcel-set-template.csv">
      CSV template
    </a>
  );
  const problems = (status.kind === "error" || status.kind === "notice") && <Problems status={status} />;

  if (!set || !summary) {
    return (
      <section className="parcels" aria-labelledby={headingId} aria-busy={busy}>
        <header className="parcels__head">
          <h2 id={headingId} className="parcels__title">
            Your parcels
          </h2>
          <div className="parcels__actions">
            {sampleButton}
            {fileInput}
            {uploadLabel("Upload CSV")}
            {templateLink}
          </div>
        </header>
        {problems}
        <div className="parcels__empty">
          <p className="parcels__empty-lead">No parcels loaded yet.</p>
          <p>
            Questions 3 and 4 price your whole mix. Load the sample (an illustrative home-goods shop, not real data) to explore, or upload a CSV with one row per kind
            of parcel: weight, distance, home or business, speed, and how many you ship.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="parcels parcels--loaded" aria-labelledby={headingId} aria-busy={busy}>
      <div className="strip">
        <div className="strip__main">
          <h2 id={headingId} className="kicker strip__title">
            Your parcels
            <span className="strip__source"> · {set.source === "sample" ? "sample mix, an example" : set.name}</span>
          </h2>
          <StripFacts summary={summary} />
        </div>
        <div className="strip__actions">
          <button
            type="button"
            className="btn"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Hide details" : "Details"}
          </button>
          {fileInput}
          {uploadLabel("Replace CSV")}
        </div>
      </div>
      {problems}
      <div id={detailsId} className="parcels__details" hidden={!expanded}>
        {set.description && <p className="parcels__source">{set.description}</p>}
        <ParcelSummary summary={summary} />
        <div className="parcels__actions">
          {sampleButton}
          {templateLink}
          <button type="button" className="btn btn--quiet" onClick={onClear}>
            Clear the set
          </button>
        </div>
      </div>
    </section>
  );
}
