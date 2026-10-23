import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BlendedResponse } from "../../api/types";
import { CARRIER_NAME, formatUsd } from "../../lib/format";
import { ChartFrame, useCssColors } from "./common";
import { OTHER_KIND, splitRows, surchargeKinds, type SplitRow } from "./logic";
import { conditionLabel, pct0 } from "./money";
import { useMediaQuery } from "../../hooks/useMediaQuery";

const COLOR_VARS = {
  base: "--q3-base",
  s0: "--q3-sur-1",
  s1: "--q3-sur-2",
  s2: "--q3-sur-3",
  s3: "--q3-sur-4",
  fuel: "--q3-fuel",
  ink: "--ink",
  muted: "--ink-muted",
  rule: "--rule",
  sheet: "--sheet",
  paper: "--paper",
  usps: "--carrier-usps",
  ups: "--carrier-ups",
  fedex: "--carrier-fedex",
} as const;

interface Segment {
  key: string;
  label: string;
  colorKey: keyof typeof COLOR_VARS;
  value: (r: SplitRow) => number;
}

function segmentsFor(kinds: { shown: string[]; folded: string[] }): Segment[] {
  const sur: Segment[] = kinds.shown.map((k, i) => ({
    key: `k_${k}`,
    label: conditionLabel(k),
    colorKey: (["s0", "s1", "s2", "s3"] as const)[Math.min(i, 3)]!,
    value: (r) => r.kinds[k] ?? 0,
  }));
  if (kinds.folded.length)
    sur.push({ key: "k_other", label: "Other surcharges", colorKey: "s3", value: (r) => r.kinds[OTHER_KIND] ?? 0 });
  return [
    { key: "base", label: "Base rate", colorKey: "base", value: (r) => r.base },
    ...sur,
    { key: "fuel", label: "Fuel", colorKey: "fuel", value: (r) => r.fuel },
  ];
}

export function CostSplitChart({ data }: { data: BlendedResponse }) {
  const colors = useCssColors(COLOR_VARS);
  const narrow = useMediaQuery("(max-width: 39.999rem)");
  const kinds = surchargeKinds(data);
  const rows = splitRows(data, kinds, CARRIER_NAME);
  const segs = segmentsFor(kinds);
  const chartRows = rows.map((r) => {
    const o: Record<string, number | string> = { label: r.label, carrier: r.carrier };
    for (const s of segs) o[s.key] = s.value(r);
    return o;
  });
  const byLabel = new Map(rows.map((r) => [r.label, r]));
  const heaviest = [...rows].sort((a, b) => b.surchargeShare + b.fuelShare - (a.surchargeShare + a.fuelShare))[0];

  const summary = (
    <>
      {rows.map((r, i) => (
        <span key={r.carrier}>
          {i > 0 && "; "}
          {r.label} {formatUsd(r.total)}: base {formatUsd(r.base)}, surcharges {formatUsd(r.surcharges)} (
          {pct0(r.surchargeShare)}), fuel {formatUsd(r.fuel)} ({pct0(r.fuelShare)})
        </span>
      ))}
      .
      {heaviest && heaviest.surchargeShare + heaviest.fuelShare > 0 && (
        <>
          {" "}
          Add-ons weigh most on {heaviest.label}: {pct0(heaviest.surchargeShare + heaviest.fuelShare)} of its cost is
          surcharges and fuel rather than base rate.
        </>
      )}
    </>
  );

  const yWidth = narrow ? 104 : 168;
  const tick = (props: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const y = Number(props.y ?? 0);
    const label = props.payload?.value ?? "";
    const r = byLabel.get(label);
    if (!r) return <g />;
    return (
      <g transform={`translate(4,${y})`}>
        <text x={0} y={-4} fill={colors[r.carrier]} fontWeight={700} fontSize={14} fontFamily="var(--font-ui)">
          {label} {formatUsd(r.total)}
        </text>
        <text x={0} y={13} fill={colors.muted} fontSize={12} fontFamily="var(--font-ui)">
          {narrow ? `surch. ${pct0(r.surchargeShare)}` : `surcharges ${pct0(r.surchargeShare)} · fuel ${pct0(r.fuelShare)}`}
        </text>
      </g>
    );
  };

  const chart = (
    <>
      <ResponsiveContainer width="100%" height={rows.length * 64 + 40} initialDimension={{ width: 600, height: 240 }}>
        <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={colors.rule} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis type="category" dataKey="label" width={yWidth} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: colors.rule, opacity: 0.35 }}
            contentStyle={{ background: colors.sheet, border: `1px solid ${colors.rule}`, borderRadius: 2, fontSize: 13 }}
            labelStyle={{ color: colors.ink, fontWeight: 700 }}
            formatter={(v, name) => [formatUsd(Number(v)), name]}
          />
          {segs.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="cost"
              fill={colors[s.colorKey]}
              stroke={colors.paper}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul className="legend" aria-hidden="true">
        {segs.map((s) => (
          <li key={s.key}>
            <span className="legend__swatch" style={{ background: `var(${COLOR_VARS[s.colorKey]})` }} />
            {s.label}
          </li>
        ))}
      </ul>
    </>
  );

  const table = (
    <table className="ledger-table">
      <caption className="visually-hidden">Cost per parcel by part, per carrier</caption>
      <thead>
        <tr>
          <th scope="col">Carrier</th>
          {segs.map((s) => (
            <th key={s.key} scope="col" className="num">
              {s.label}
            </th>
          ))}
          <th scope="col" className="num">
            Total
          </th>
          <th scope="col" className="num">
            Surcharge share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.carrier}>
            <th scope="row">{r.label}</th>
            {segs.map((s) => (
              <td key={s.key} className="num">
                {formatUsd(s.value(r))}
              </td>
            ))}
            <td className="num">{formatUsd(r.total)}</td>
            <td className="num">{pct0(r.surchargeShare)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return <ChartFrame title="What each parcel costs, by part" summary={summary} chart={chart} table={table} />;
}
