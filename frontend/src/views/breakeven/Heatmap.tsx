import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { BreakevenCell, BreakevenResponse, Carrier, Meta } from "../../api/types";
import { CARRIERS } from "../../api/types";
import { TIE_DOLLARS, cellGrid, cellKey, groundName, isTie, savingLevel, zoneLabel } from "./readout";
import { useWidth } from "./useWidth";
import { CARRIER_NAME } from "../../lib/carriers";
import { formatInt, formatUsd } from "../../lib/format";

// The lightest step keeps 45 % of the carrier colour so cells read as the carrier, not as a pastel, on white.
const LEVEL_MIX = [45, 63, 82, 100] as const;

export function cellFill(c: BreakevenCell | null, tiePattern = "hm-tie"): string {
  if (!c?.winner) return "var(--wash)";
  if (isTie(c)) return `url(#${tiePattern})`;
  const v = `var(--carrier-${c.winner.carrier})`;
  const w = `var(--carrier-${c.winner.carrier}-wash)`;
  return `color-mix(in oklch, ${v} ${LEVEL_MIX[savingLevel(c.saving)]}%, ${w})`;
}

function cellLabel(c: BreakevenCell | null, meta: Meta | null, residential: boolean): string {
  if (!c) return "no data";
  const head = `${c.weight_lb} lb, ${formatInt(c.distance_miles)} mi`;
  if (!c.winner) return `${head}: no ground service can carry it`;
  const win = `${groundName(meta, c.winner.carrier, residential)} cheapest at ${formatUsd(c.winner.total)}`;
  const run = c.runner_up
    ? `, ${formatUsd(c.saving)} less than ${groundName(meta, c.runner_up.carrier, residential)}${isTie(c) ? ", a tie" : ""}`
    : ", no other carrier to compare";
  return `${head}: ${win}${run}`;
}

const AXIS_W = 46;
const HEAD_H = 38;
const LABEL_PX = 11;
const LABEL_PX_COMPACT = 10;

export const runLabelText = (k: Carrier | "tie") => (k === "tie" ? "Tie" : CARRIER_NAME[k]);

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
  const tiePattern = `hm-tie-${useId().replace(/:/g, "")}`;

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
  const labelPx = compact ? LABEL_PX_COMPACT : LABEL_PX;
  const deco = useMemo(
    () => decorations(grid, res.weights_lb, cols, colW, rowH, labelPx),
    [grid, res.weights_lb, cols, colW, rowH, labelPx],
  );
  const { boundaries, rivalEdges, runLabels, weightTicks, colSeps } = deco;

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
          <defs aria-hidden="true">
            {/* A UPS/FedEx near-tie: stripes of both colours, so it reads as neither winning. */}
            <pattern id={tiePattern} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={4} height={8} className="hm__tie hm__tie--ups" />
              <rect x={4} width={4} height={8} className="hm__tie hm__tie--fedex" />
            </pattern>
          </defs>
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
                    data-tie={isTie(cell) || undefined}
                    data-level={cell ? savingLevel(cell.saving) : 0}
                    x={AXIS_W + c * colW}
                    y={HEAD_H + r * rowH}
                    width={colW}
                    height={rowH}
                    style={{ fill: cellFill(cell, tiePattern) }}
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
            d={colSeps}
            className="hm__colsep"
            aria-hidden="true"
          />
          <path d={rivalEdges} className="hm__boundary hm__boundary--rival" aria-hidden="true" />
          <path d={boundaries} className="hm__boundary" aria-hidden="true" />
          <g aria-hidden="true">
            {runLabels.map((l, i) => (
              <text key={i} x={l.x} y={l.y} dy="0.35em" textAnchor="middle" className="hm__runlabel" fontSize={labelPx}>
                {runLabelText(l.carrier)}
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

/**
 * The static layers over the cells: winner boundaries (USPS against the rest heavy, UPS, FedEx
 * and their near-ties against each other thin), carrier names on tall runs that fit their column,
 * weight ticks and column separators. Pure, so the view memoizes it and hovering a cell does not
 * recompute it.
 */
export function decorations(
  grid: (BreakevenCell | null)[][],
  weights: readonly number[],
  cols: number,
  colW: number,
  rowH: number,
  labelPx: number = LABEL_PX,
) {
  const rows = weights.length;
  const boundaries: string[] = [];
  const rivalEdges: string[] = [];
  type Key = ReturnType<typeof cellKey>;
  const edge = (a: Key, b: Key) => (a === "usps" || b === "usps" ? boundaries : rivalEdges);
  const key = (r: number, c: number) => cellKey(grid[r]?.[c] ?? null);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = key(r, c);
      const right = key(r, c + 1);
      const below = key(r + 1, c);
      const x = AXIS_W + c * colW;
      const y = HEAD_H + r * rowH;
      if (c + 1 < cols && here !== right) edge(here, right).push(`M${x + colW},${y}v${rowH}`);
      if (r + 1 < rows && here !== below) edge(here, below).push(`M${x},${y + rowH}h${colW}`);
    }
  }

  // A rough width for the bold label (about 0.6 em a character) with 2 px clear on each side.
  const fits = (k: Carrier | "tie") => runLabelText(k).length * labelPx * 0.6 + 4 <= colW;
  const runLabels: { x: number; y: number; carrier: Carrier | "tie" }[] = [];
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      const prev = key(r - 1, c);
      const cur = r < rows ? key(r, c) : undefined;
      if (cur === prev && r < rows) continue;
      if (prev && (r - start) * rowH >= 26 && fits(prev)) {
        runLabels.push({ x: AXIS_W + c * colW + colW / 2, y: HEAD_H + ((start + r) / 2) * rowH, carrier: prev });
      }
      start = r;
    }
  }

  const weightTicks = weights.map((w, r) => ({ w, r })).filter(({ w, r }) => (rows > 40 ? r === 0 || w % 10 === 0 : true));
  const colSeps = Array.from({ length: Math.max(0, cols - 1) }, (_, c) => `M${AXIS_W + (c + 1) * colW},${HEAD_H}v${rowH * rows}`).join("");
  return { boundaries: boundaries.join(""), rivalEdges: rivalEdges.join(""), runLabels, weightTicks, colSeps };
}

function tooltipPos(at: { r: number; c: number }, colW: number, rowH: number, svgW: number) {
  const TIP_W = 220;
  const cx = AXIS_W + at.c * colW + colW / 2;
  const left = Math.min(Math.max(4, cx - TIP_W / 2), Math.max(4, svgW - TIP_W - 4));
  const y = HEAD_H + at.r * rowH;
  const below = y < 170;
  return { left, top: below ? y + rowH + 8 : y - 8, below };
}

function tipFoot(cell: BreakevenCell): string {
  const { winner, runner_up: runnerUp } = cell;
  if (!winner) return "No ground service can carry it";
  if (!runnerUp) return `Only ${CARRIER_NAME[winner.carrier]} has a price here`;
  const saves = `${CARRIER_NAME[winner.carrier]} saves ${formatUsd(cell.saving)} over ${CARRIER_NAME[runnerUp.carrier]}`;
  return isTie(cell) ? `A tie: ${saves}, under ${formatUsd(TIE_DOLLARS)}` : saves;
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
        {tipFoot(cell)}
      </p>
    </>
  );
}
