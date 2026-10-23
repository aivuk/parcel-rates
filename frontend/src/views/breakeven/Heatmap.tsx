import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { BreakevenCell, BreakevenResponse, Carrier, Meta } from "../../api/types";
import { CARRIERS } from "../../api/types";
import { CARRIER_NAME, formatInt, formatUsd } from "../../lib/format";
import { cellGrid, groundName, savingLevel, zoneLabel } from "./readout";
import { useWidth } from "./useWidth";

const LEVEL_MIX = [22, 48, 74, 100] as const;

export function cellFill(c: BreakevenCell | null): string {
  if (!c?.winner) return "var(--wash)";
  const v = `var(--carrier-${c.winner.carrier})`;
  const w = `var(--carrier-${c.winner.carrier}-wash)`;
  return `color-mix(in srgb, ${v} ${LEVEL_MIX[savingLevel(c.saving)]}%, ${w})`;
}

function cellLabel(c: BreakevenCell | null, meta: Meta | null, residential: boolean): string {
  if (!c) return "no data";
  const head = `${c.weight_lb} lb, ${formatInt(c.distance_miles)} mi`;
  if (!c.winner) return `${head}: no ground service can carry it`;
  const win = `${groundName(meta, c.winner.carrier, residential)} cheapest at ${formatUsd(c.winner.total)}`;
  const run = c.runner_up
    ? `, ${formatUsd(c.saving)} less than ${groundName(meta, c.runner_up.carrier, residential)}`
    : ", no other carrier to compare";
  return `${head}: ${win}${run}`;
}

const AXIS_W = 46;
const HEAD_H = 38;

export interface HeatmapProps {
  res: BreakevenResponse;
  meta: Meta | null;
}

export function Heatmap({ res, meta }: HeatmapProps) {
  const grid = useMemo(() => cellGrid(res), [res]);
  const rows = res.weights_lb.length;
  const cols = res.distances_miles.length;
  const [wrapRef, width] = useWidth<HTMLDivElement>(640);
  const compact = width < 480;
  const colW = Math.max(30, (Math.max(width, 280) - AXIS_W) / Math.max(cols, 1));
  const rowH = rows > 40 ? 8 : compact ? 18 : 22;
  const svgW = AXIS_W + colW * cols;
  const svgH = HEAD_H + rowH * rows + 2;

  const [active, setActive] = useState({ r: 0, c: 0 });
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  /** Escape closes the tooltip but keeps the focus ring; any move or click opens it again. */
  const [tipDismissed, setTipDismissed] = useState(false);
  const cellRefs = useRef<(SVGRectElement | null)[]>([]);

  const ring = hover ?? (focused || pinned ? active : null);
  const show = hover ?? (!tipDismissed && (focused || pinned) ? active : null);
  const shownCell = show ? (grid[show.r]?.[show.c] ?? null) : null;

  const moveTo = (r: number, c: number) => {
    const nr = Math.min(rows - 1, Math.max(0, r));
    const nc = Math.min(cols - 1, Math.max(0, c));
    setActive({ r: nr, c: nc });
    setHover(null);
    setTipDismissed(false);
    cellRefs.current[nr * cols + nc]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const { r, c } = active;
    const map: Record<string, [number, number] | undefined> = {
      ArrowUp: [r - 1, c],
      ArrowDown: [r + 1, c],
      ArrowLeft: [r, c - 1],
      ArrowRight: [r, c + 1],
      PageUp: [r - 10, c],
      PageDown: [r + 10, c],
      Home: e.ctrlKey ? [0, 0] : [r, 0],
      End: e.ctrlKey ? [rows - 1, cols - 1] : [r, cols - 1],
    };
    if (e.key === "Escape") {
      setPinned(false);
      setHover(null);
      setTipDismissed(true);
      return;
    }
    const to = map[e.key];
    if (!to) return;
    e.preventDefault();
    setFocused(true);
    moveTo(to[0], to[1]);
  };

  // Boundaries where the winner changes: drawn in ink so regions read without colour.
  // USPS against the rest is the breakeven itself (heavy line); UPS against FedEx is a thin line.
  const boundaries: string[] = [];
  const rivalEdges: string[] = [];
  const edge = (a: Carrier | undefined, b: Carrier | undefined) => (a === "usps" || b === "usps" ? boundaries : rivalEdges);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = grid[r]?.[c]?.winner?.carrier;
      const right = grid[r]?.[c + 1]?.winner?.carrier;
      const below = grid[r + 1]?.[c]?.winner?.carrier;
      const x = AXIS_W + c * colW;
      const y = HEAD_H + r * rowH;
      if (c + 1 < cols && here !== right) edge(here, right).push(`M${x + colW},${y}v${rowH}`);
      if (r + 1 < rows && here !== below) edge(here, below).push(`M${x},${y + rowH}h${colW}`);
    }
  }

  // Name each run of one winner inside a column when it is tall enough to hold a label.
  const runLabels: { x: number; y: number; carrier: Carrier }[] = [];
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      const prev = grid[r - 1]?.[c]?.winner?.carrier;
      const cur = r < rows ? grid[r]?.[c]?.winner?.carrier : undefined;
      if (cur === prev && r < rows) continue;
      if (prev && (r - start) * rowH >= 26) {
        runLabels.push({ x: AXIS_W + c * colW + colW / 2, y: HEAD_H + ((start + r) / 2) * rowH, carrier: prev });
      }
      start = r;
    }
  }

  const weightTicks = res.weights_lb
    .map((w, r) => ({ w, r }))
    .filter(({ w, r }) => (rows > 40 ? r === 0 || w % 10 === 0 : true));

  const tip = show && shownCell ? tooltipPos(show, colW, rowH, svgW) : null;

  return (
    <div className="hm" ref={wrapRef}>
      <div className="hm__scroll">
        <svg
          className="hm__svg"
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          role="grid"
          aria-label={`Cheapest ground carrier by weight (rows, ${res.weights_lb[0]} to ${res.weights_lb[rows - 1]} lb) and distance (columns). Arrow keys move between cells.`}
          aria-rowcount={rows}
          aria-colcount={cols}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setHover(null)}
        >
          <g aria-hidden="true" className="hm__axis">
            {res.distances_miles.map((d, c) => {
              const band = res.breakeven_weight_lb[c];
              const x = AXIS_W + c * colW + colW / 2;
              return (
                <g key={d}>
                  <text x={x} y={14} textAnchor="middle" className="hm__colhead">
                    {compact ? formatInt(d) : `${formatInt(d)} mi`}
                  </text>
                  <text x={x} y={29} textAnchor="middle" className="hm__colsub">
                    {compact ? `z${band?.zone_usps ?? "—"}` : `zone ${band?.zone_usps ?? "—"}`}
                  </text>
                </g>
              );
            })}
            {weightTicks.map(({ w, r }) => (
              <text key={w} x={AXIS_W - 6} y={HEAD_H + r * rowH + rowH / 2} dy="0.35em" textAnchor="end" className="hm__rowhead">
                {w} lb
              </text>
            ))}
          </g>
          {res.weights_lb.map((w, r) => (
            <g key={w} role="row" aria-rowindex={r + 1}>
              {res.distances_miles.map((d, c) => {
                const cell = grid[r]?.[c] ?? null;
                const isActive = active.r === r && active.c === c;
                return (
                  <rect
                    key={d}
                    ref={(el) => {
                      cellRefs.current[r * cols + c] = el;
                    }}
                    role="gridcell"
                    aria-colindex={c + 1}
                    aria-label={cellLabel(cell, meta, res.residential)}
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    data-carrier={cell?.winner?.carrier ?? "none"}
                    data-level={cell ? savingLevel(cell.saving) : 0}
                    x={AXIS_W + c * colW}
                    y={HEAD_H + r * rowH}
                    width={colW}
                    height={rowH}
                    style={{ fill: cellFill(cell) }}
                    className="hm__cell"
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      setHover({ r, c });
                      setTipDismissed(false);
                    }}
                    onClick={() => {
                      setActive({ r, c });
                      setPinned(true);
                      setTipDismissed(false);
                    }}
                    onFocus={() => {
                      setActive({ r, c });
                      setFocused(true);
                    }}
                    onBlur={() => setFocused(false)}
                  />
                );
              })}
            </g>
          ))}
          <path
            d={res.distances_miles.slice(1).map((_, c) => `M${AXIS_W + (c + 1) * colW},${HEAD_H}v${rowH * rows}`).join("")}
            className="hm__colsep"
            aria-hidden="true"
          />
          <path d={rivalEdges.join("")} className="hm__boundary hm__boundary--rival" aria-hidden="true" />
          <path d={boundaries.join("")} className="hm__boundary" aria-hidden="true" />
          <g aria-hidden="true">
            {runLabels.map((l, i) => (
              <text key={i} x={l.x} y={l.y} dy="0.35em" textAnchor="middle" className="hm__runlabel">
                {CARRIER_NAME[l.carrier]}
              </text>
            ))}
          </g>
          {ring && (
            <rect
              aria-hidden="true"
              data-testid="heatmap-focus"
              className="hm__focus"
              x={AXIS_W + ring.c * colW + 1}
              y={HEAD_H + ring.r * rowH}
              width={colW - 2}
              height={rowH}
            />
          )}
        </svg>
        {tip && shownCell && (
          <div className="hm__tip" role="status" style={{ left: tip.left, top: tip.top }} data-below={tip.below}>
            <Tooltip cell={shownCell} meta={meta} residential={res.residential} />
          </div>
        )}
      </div>
    </div>
  );
}

function tooltipPos(at: { r: number; c: number }, colW: number, rowH: number, svgW: number) {
  const TIP_W = 220;
  const cx = AXIS_W + at.c * colW + colW / 2;
  const left = Math.min(Math.max(4, cx - TIP_W / 2), Math.max(4, svgW - TIP_W - 4));
  const y = HEAD_H + at.r * rowH;
  const below = y < 170;
  return { left, top: below ? y + rowH + 8 : y - 8, below };
}

export function Tooltip({ cell, meta, residential }: { cell: BreakevenCell; meta: Meta | null; residential: boolean }) {
  const entries = CARRIERS.filter((c) => cell.totals[c] !== undefined).sort((a, b) => cell.totals[a]! - cell.totals[b]!);
  return (
    <>
      <p className="hm__tiphead">
        {cell.weight_lb} lb · {formatInt(cell.distance_miles)} mi
        <span>{zoneLabel(cell.zone_usps, cell.zone_private)}</span>
      </p>
      <table className="hm__tiptable">
        <tbody>
          {entries.map((c) => (
            <tr key={c} className={cell.winner?.carrier === c ? "is-winner" : undefined}>
              <th scope="row">
                <span className={`hm__dot hm__dot--${c}`} aria-hidden="true" />
                {groundName(meta, c, residential)}
              </th>
              <td className="num">{formatUsd(cell.totals[c]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hm__tipfoot">
        {cell.winner && cell.runner_up
          ? `${CARRIER_NAME[cell.winner.carrier]} saves ${formatUsd(cell.saving)} over ${CARRIER_NAME[cell.runner_up.carrier]}`
          : cell.winner
            ? `Only ${CARRIER_NAME[cell.winner.carrier]} has a price here`
            : "No ground service can carry it"}
      </p>
    </>
  );
}
