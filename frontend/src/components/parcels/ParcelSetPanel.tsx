import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ZoneBand } from "../../api/types";
import { TIERS } from "../../api/types";
import { CSV_TEMPLATE } from "../../lib/parcelCsv";
import { summarize, type ParcelSummary as Summary } from "../../lib/summary";
import type { ParcelSet, ParcelSetStatus } from "../../hooks/useParcelSet";
import { ParcelSummary } from "./ParcelSummary";
import { formatInt, formatShare, TIER_NAME } from "../../lib/format";

export interface ParcelSetPanelProps {
  set: ParcelSet | null;
  status: ParcelSetStatus;
  /** Zone bands from /api/meta; the USPS ones bucket the distance distribution. */
  zoneBands?: ZoneBand[];
  onLoadSample: () => void;
  onLoadFile: (file: File) => void;
  onClear: () => void;
  /** The CSV file input, so the question views' "Upload CSV" buttons can open the same picker. */
  fileInputRef?: RefObject<HTMLInputElement>;
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

/** One line: share to homes and speed split, at the top of the details. */
function StripFacts({ summary }: { summary: Summary }) {
  return (
    <p className="strip__facts">
      <span>{formatShare(summary.residentialShare)} to homes</span>
      <span>
        {TIERS.filter((t) => summary.byTier[t] > 0)
          .map((t) => `${formatShare(summary.byTier[t])} ${TIER_NAME[t].toLowerCase()}`)
          .join(" · ")}
      </span>
    </p>
  );
}

/** The parcel set's pieces. Without a set: the full panel (load, upload, template). With one:
 *  a heading and the actions that sit in the question bar, and what goes under the bar
 *  (problems, the details on demand). */
export interface ParcelSetUi {
  panel: ReactNode | null;
  barStart: ReactNode | null;
  barEnd: ReactNode | null;
  belowBar: ReactNode | null;
}

export function useParcelSetUi({ set, status, zoneBands, onLoadSample, onLoadFile, onClear, fileInputRef }: ParcelSetPanelProps): ParcelSetUi {
  const fileId = useId();
  const headingId = useId();
  const detailsId = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = fileInputRef ?? ownRef;
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
  const uploadLabel = (text: string, extra = "") => (
    <label htmlFor={fileId} className={`btn file-btn ${extra}`}>
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
    return {
      panel: (
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
              of parcel: weight, distance (or a destination ZIP), home or business, speed, and how many you ship.
            </p>
          </div>
        </section>
      ),
      barStart: null,
      barEnd: null,
      belowBar: null,
    };
  }

  return {
    panel: null,
    barStart: (
      <h2 id={headingId} className="strip" aria-busy={busy}>
        <span className="visually-hidden">Your parcels: </span>
        <span className="strip__count">
          <span className="figure">{formatInt(summary.parcels)}</span> parcels
        </span>
        <span className="strip__source"> · {set.source === "sample" ? "sample mix" : set.name}</span>
      </h2>
    ),
    barEnd: (
      <div className="strip__actions">
        <button
          type="button"
          className="btn btn--small"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Hide details" : "Details"}
        </button>
        {fileInput}
        {uploadLabel("Replace CSV", "btn--small")}
      </div>
    ),
    belowBar: (
      <>
        {problems}
        <section id={detailsId} className="parcels__details" aria-labelledby={headingId} hidden={!expanded}>
          <StripFacts summary={summary} />
          {set.description && <p className="parcels__source">{set.description}</p>}
          <ParcelSummary summary={summary} />
          <div className="parcels__actions">
            {sampleButton}
            {templateLink}
            <button type="button" className="btn btn--quiet" onClick={onClear}>
              Clear the set
            </button>
          </div>
        </section>
      </>
    ),
  };
}
