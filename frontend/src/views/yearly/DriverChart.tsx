import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Carrier, YearRow } from "../../api/types";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatUsd } from "../../lib/format";
import { ChartFrame, useCssColors } from "../blended/common";
import { carrierName, signedUsd } from "../blended/money";
import { DIMENSION_LABEL, driverSentence, segmentLabel, sortedDrivers, withinChange, type Dimension } from "./logic";

const COLOR_VARS = { up: "--q4-up", down: "--q4-down", muted: "--ink-muted", ink: "--ink", rule: "--rule", sheet: "--sheet" } as const;

export function DriverChart({ carrier, row, dim }: { carrier: Carrier; row: YearRow; dim: Dimension }) {
  const colors = useCssColors(COLOR_VARS);
  const narrow = useMediaQuery("(max-width: 39.999rem)");
  const list = sortedDrivers(row.drivers?.[dim] ?? []);
  const sentence = driverSentence(carrier, row, dim);
  const ch = row.change_vs_previous;
  const rows = list.map((d) => ({ label: segmentLabel(dim, d.segment), value: d.change_per_parcel, parcels: d.parcels, within: withinChange(d) }));
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const hi = Math.max(0, ...rows.map((r) => r.value));
  const ticks = niceTicks(lo, hi, narrow ? 2 : 4);
  const domain: [number, number] = [ticks[0]!, ticks[ticks.length - 1]!];
  const yWidth = narrow ? 158 : 196;
  const byLabel = new Map(rows.map((r) => [r.label, r]));

  const tick = (props: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const r = byLabel.get(props.payload?.value ?? "");
    const y = Number(props.y ?? 0);
    if (!r) return <g />;
    return (
      <g transform={`translate(4,${y})`}>
        <text x={0} y={-11} fill={colors.ink} fontSize={13} fontWeight={600} fontFamily="var(--font-ui)">
          {r.label} <tspan fill={colors.muted} fontWeight={400}>· {r.parcels}</tspan>
        </text>
        <text x={0} y={5} fill={colors.ink} fontSize={12} fontFamily="var(--font-ui)">
          {signedUsd(r.value)} of the total
        </text>
        <text x={0} y={20} fill={colors.muted} fontSize={12} fontFamily="var(--font-ui)">
          {signedUsd(r.within)} each
        </text>
      </g>
    );
  };

  const chart = (
    <ResponsiveContainer width="100%" height={rows.length * 64 + 36} initialDimension={{ width: 600, height: 240 }}>
      <BarChart accessibilityLayer={false} data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={colors.rule} />
        <XAxis
          type="number"
          domain={domain}
          tickFormatter={(v: number) => signedUsd(v)}
          tick={{ fill: colors.muted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          ticks={ticks}
        />
        <YAxis type="category" dataKey="label" width={yWidth} tick={tick} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke={colors.ink} />
        <Tooltip
          cursor={{ fill: colors.rule, opacity: 0.35 }}
          contentStyle={{ background: colors.sheet, border: `1px solid ${colors.rule}`, borderRadius: 2, fontSize: 13 }}
          labelStyle={{ color: colors.ink, fontWeight: 700 }}
          formatter={(v) => [`${signedUsd(Number(v))} per parcel`, "Contribution"]}
        />
        <Bar dataKey="value" isAnimationActive={false} radius={2}>
          {rows.map((r) => (
            <Cell key={r.label} fill={r.value >= 0 ? colors.up : colors.down} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const table = (
    <table className="ledger-table">
      <caption className="visually-hidden">
        Contribution of each {DIMENSION_LABEL[dim].toLowerCase()} segment to the change in cost per parcel
      </caption>
      <thead>
        <tr>
          <th scope="col">Segment</th>
          <th scope="col" className="num">
            Parcels
          </th>
          <th scope="col" className="num">
            Contribution per parcel (all)
          </th>
          <th scope="col" className="num">
            Change per parcel in segment
          </th>
          <th scope="col" className="num">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {list.map((d) => (
          <tr key={d.segment}>
            <th scope="row">{segmentLabel(dim, d.segment)}</th>
            <td className="num">{d.parcels}</td>
            <td className="num">{signedUsd(d.change_per_parcel)}</td>
            <td className="num">{signedUsd(withinChange(d))}</td>
            <td className="num">{signedUsd(d.change_total)}</td>
          </tr>
        ))}
        {ch && (
          <tr className="ledger-table__total">
            <th scope="row">All parcels</th>
            <td className="num">{list.reduce((n, d) => n + d.parcels, 0)}</td>
            <td className="num">{signedUsd(ch.dollars_per_parcel)}</td>
            <td className="num">{signedUsd(ch.dollars_per_parcel)}</td>
            <td className="num">—</td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const summary = (
    <>
      <span className="driver-sentence" data-testid="driver-sentence">
        {sentence ?? "No change to break down."}
      </span>{" "}
      Bars add up to the {ch ? signedUsd(ch.dollars_per_parcel) : formatUsd(0)} per parcel change for {carrierName(carrier)}; to the right
      a segment made parcels dearer, to the left cheaper. “Each” is the change for that segment’s own parcels, which does not
      depend on how many of them you ship.
    </>
  );

  return <ChartFrame title={`What drove ${carrierName(carrier)}’s change, by ${DIMENSION_LABEL[dim].toLowerCase()}`} summary={summary} chart={chart} table={table} />;
}

/** Round tick values (steps of 1, 2, 2.5 or 5 × 10^k) spanning lo..hi and always including 0. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const span = Math.max(hi - lo, 0.01);
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  if (out.length < 2) out.push(out[0]! + step);
  return out;
}
