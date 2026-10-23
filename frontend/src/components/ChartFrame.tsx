import "../styles/chart.css";
import { useId, useState, type ReactNode } from "react";

/** A chart with its title, a text summary, and a table alternative behind a toggle. */
export function ChartFrame({
  title,
  summary,
  chart,
  table,
  aside,
  controls,
}: {
  title: string;
  summary: ReactNode;
  /** Controls that change the chart (e.g. a scale toggle); shown in chart mode only. */
  controls?: ReactNode;
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
        {asTable ? (
          // Wide tables scroll sideways on phones; focusable so the keyboard can scroll them.
          <div className="chart__table-wrap" tabIndex={0} role="region" aria-label={`${title}, as a table`}>
            {table}
          </div>
        ) : (
          <>
            {controls && <div className="chart__controls">{controls}</div>}
            <div aria-hidden="true">{chart}</div>
          </>
        )}
      </div>
      {aside}
    </figure>
  );
}
