import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Carrier, YearlyResponse } from "../../api/types";
import { formatUsd } from "../../lib/format";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { ChartFrame, useCssColors } from "../blended/common";
import { carrierName, signedPct } from "../blended/money";
import { announcedPath, biggestFuelStep, fuelSentence, referenceYear, type PointNote } from "./logic";

const COLOR_VARS = {
  usps: "--carrier-usps",
  ups: "--carrier-ups",
  fedex: "--carrier-fedex",
  muted: "--ink-muted",
  ink: "--ink",
  rule: "--rule",
  sheet: "--sheet",
  paper: "--paper",
  loss: "--loss",
} as const;

/** Marker shape per carrier, so lines differ without colour. */
const SHAPE: Record<Carrier, "circle" | "square" | "triangle"> = { usps: "circle", ups: "square", fedex: "triangle" };
const SHAPE_WORD: Record<Carrier, string> = { usps: "circles", ups: "squares", fedex: "triangles" };

function Marker({ cx, cy, shape, color, ring, r = 5 }: { cx: number; cy: number; shape: string; color: string; ring: string; r?: number }) {
  if (shape === "square")
    return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={color} stroke={ring} strokeWidth={2} />;
  if (shape === "triangle")
    return (
      <polygon
        points={`${cx},${cy - r - 1.5} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`}
        fill={color}
        stroke={ring}
        strokeWidth={2}
      />
    );
  return <circle cx={cx} cy={cy} r={r} fill={color} stroke={ring} strokeWidth={2} />;
}

export function YearChart({ data, notes }: { data: YearlyResponse; notes: PointNote[] }) {
  const colors = useCssColors(COLOR_VARS);
  const narrow = useMediaQuery("(max-width: 39.999rem)");
  const carriers = data.carriers.filter((c) => c.years.length > 0 && c.parcels_used > 0);
  const years = new Set<number>();
  for (const c of carriers) {
    c.years.forEach((y) => years.add(y.year));
    if (c.projected) years.add(c.projected.year);
  }
  const yearList = [...years].sort((a, b) => a - b);
  const paths = new Map(carriers.map((c) => [c.carrier, announcedPath(c)]));
  const noteAt = new Set(notes.map((n) => `${n.carrier}:${n.year}`));

  const rows = yearList.map((year) => {
    const o: Record<string, number | null> = { year };
    for (const c of carriers) {
      const row = c.years.find((y) => y.year === year);
      const last = c.years[c.years.length - 1]!;
      o[c.carrier] = row ? row.cost_per_parcel : null;
      o[`${c.carrier}_ann`] = paths.get(c.carrier)?.get(year) ?? null;
      o[`${c.carrier}_proj`] =
        year === last.year ? last.cost_per_parcel : c.projected && year === c.projected.year ? c.projected.cost_per_parcel : null;
    }
    return o;
  });

  const ref = referenceYear(data);
  const fuelSteps = carriers.map((c) => biggestFuelStep(c, ref ?? undefined)).filter((s) => s !== null);

  const summary = (
    <>
      {carriers.map((c, i) => {
        const first = c.years[0]!;
        const last = c.years[c.years.length - 1]!;
        const pct = ((last.cost_per_parcel - first.cost_per_parcel) / first.cost_per_parcel) * 100;
        return (
          <span key={c.carrier}>
            {i > 0 && " "}
            {carrierName(c.carrier)} ({SHAPE_WORD[c.carrier]}) went from {formatUsd(first.cost_per_parcel)} in {first.year} to{" "}
            {formatUsd(last.cost_per_parcel)} in {last.year} ({signedPct(pct)})
            {c.projected && (
              <>
                , projected {formatUsd(c.projected.cost_per_parcel)} in {c.projected.year} at {signedPct(c.projected.increase_percent)}
              </>
            )}
            .
          </span>
        );
      })}{" "}
      Dashed lines follow the announced increases from the first year; dotted segments are the projection.
    </>
  );

  const dot =
    (carrier: Carrier) =>
    (props: { cx?: number; cy?: number; index?: number; payload?: Record<string, number | null> }) => {
      const { cx, cy, payload } = props;
      if (cx === undefined || cy === undefined || !payload || payload[carrier] == null) return <g key={`${carrier}-${props.index}`} />;
      const flagged = noteAt.has(`${carrier}:${payload.year}`);
      const isLast = carriers.find((c) => c.carrier === carrier)?.years.at(-1)?.year === payload.year;
      return (
        <g key={`${carrier}-${props.index}`}>
          <Marker cx={cx} cy={cy} shape={SHAPE[carrier]} color={colors[carrier]} ring={colors.paper} />
          {flagged && (
            <g>
              <circle cx={cx} cy={cy - 16} r={8} fill={colors.paper} stroke={colors.ink} strokeWidth={1.5} />
              <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={colors.ink}>
                !
              </text>
            </g>
          )}
          {isLast && !narrow && (
            <text x={cx + 10} y={cy + 4} fontSize={12} fontWeight={700} fill={colors[carrier]} fontFamily="var(--font-ui)">
              {carrierName(carrier)}
            </text>
          )}
        </g>
      );
    };

  const chart = (
    <>
      <ResponsiveContainer width="100%" height={narrow ? 280 : 340} initialDimension={{ width: 600, height: 320 }}>
        <LineChart data={rows} margin={{ top: 24, right: narrow ? 12 : 64, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.rule} />
          <XAxis
            dataKey="year"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={yearList}
            tickFormatter={(v: number) => (narrow ? `’${String(v).slice(2)}` : String(v))}
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={{ stroke: colors.rule }}
            tickLine={false}
            padding={{ left: 12, right: 12 }}
          />
          <YAxis
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fill: colors.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: colors.sheet, border: `1px solid ${colors.rule}`, borderRadius: 2, fontSize: 13 }}
            labelStyle={{ color: colors.ink, fontWeight: 700 }}
            formatter={(v, name) => [formatUsd(Number(v)), name]}
          />
          {carriers.map((c) => [
            <Line
              key={`${c.carrier}-ann`}
              dataKey={`${c.carrier}_ann`}
              name={`${carrierName(c.carrier)} at announced increases`}
              stroke={colors[c.carrier]}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.75}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />,
            <Line
              key={`${c.carrier}-proj`}
              dataKey={`${c.carrier}_proj`}
              name={`${carrierName(c.carrier)} projected`}
              stroke={colors[c.carrier]}
              strokeWidth={2}
              strokeDasharray="1 5"
              strokeLinecap="round"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />,
            <Line
              key={c.carrier}
              dataKey={c.carrier}
              name={carrierName(c.carrier)}
              stroke={colors[c.carrier]}
              strokeWidth={2.5}
              dot={dot(c.carrier)}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
              connectNulls={false}
            />,
          ])}
        </LineChart>
      </ResponsiveContainer>
      <ul className="legend" aria-hidden="true">
        {carriers.map((c) => (
          <li key={c.carrier}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <Marker cx={7} cy={7} shape={SHAPE[c.carrier]} color={`var(--carrier-${c.carrier})`} ring="transparent" r={4.5} />
            </svg>
            {carrierName(c.carrier)}
          </li>
        ))}
        <li>
          <span className="legend__line" style={{ borderTopStyle: "dashed", borderColor: "var(--ink-muted)" }} />
          Announced increases
        </li>
        <li>
          <span className="legend__line" style={{ borderTopStyle: "dotted", borderColor: "var(--ink-muted)" }} />
          Projection
        </li>
        <li>
          <span className="legend__flag">!</span> Note below
        </li>
      </ul>
    </>
  );

  const table = (
    <table className="ledger-table">
      <caption className="visually-hidden">Cost per parcel by carrier and year</caption>
      <thead>
        <tr>
          <th scope="col">Carrier</th>
          <th scope="col">Year</th>
          <th scope="col" className="num">
            Cost / parcel
          </th>
          <th scope="col" className="num">
            Change
          </th>
          <th scope="col" className="num">
            Announced
          </th>
          <th scope="col" className="num">
            Fuel (ground / express)
          </th>
        </tr>
      </thead>
      <tbody>
        {carriers.flatMap((c) => [
          ...c.years.map((y) => (
            <tr key={`${c.carrier}-${y.year}`}>
              <th scope="row">{carrierName(c.carrier)}</th>
              <td>
                {y.year}
                {noteAt.has(`${c.carrier}:${y.year}`) && " (see note)"}
              </td>
              <td className="num">{formatUsd(y.cost_per_parcel)}</td>
              <td className="num">{y.change_vs_previous?.percent != null ? signedPct(y.change_vs_previous.percent) : "—"}</td>
              <td className="num">{y.announced_increase.percent != null ? `${y.announced_increase.percent}%` : "—"}</td>
              <td className="num">
                {y.fuel ? `${y.fuel.ground.applied_percent ?? "—"}% / ${y.fuel.express.applied_percent ?? "—"}%` : "none"}
              </td>
            </tr>
          )),
          ...(c.projected
            ? [
                <tr key={`${c.carrier}-proj`}>
                  <th scope="row">{carrierName(c.carrier)}</th>
                  <td>{c.projected.year} (projected)</td>
                  <td className="num">{formatUsd(c.projected.cost_per_parcel)}</td>
                  <td className="num">{signedPct(c.projected.increase_percent)}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                </tr>,
              ]
            : []),
        ])}
      </tbody>
    </table>
  );

  const fuelCarriers = carriers.filter((c) => c.years.some((y) => y.fuel));
  const aside = (
    <div className="fuel-note" data-testid="fuel-note">
      <p className="fuel-note__title">How much of the change is fuel?</p>
      {fuelSteps.map((s) => (
        <p key={s.carrier} className="fuel-note__line">
          {fuelSentence(s)}
        </p>
      ))}
      {fuelCarriers.length > 0 && (
        <table className="fuel-strip">
          <caption className="visually-hidden">Fuel surcharge applied per year, ground services</caption>
          <thead>
            <tr>
              <th scope="col">Fuel, ground</th>
              {yearList
                .filter((y) => fuelCarriers.some((c) => c.years.some((r) => r.year === y)))
                .map((y) => (
                  <th key={y} scope="col" className="num">
                    {y}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {fuelCarriers.map((c) => (
              <tr key={c.carrier}>
                <th scope="row" style={{ color: `var(--carrier-${c.carrier})` }}>
                  {carrierName(c.carrier)}
                </th>
                {yearList
                  .filter((y) => fuelCarriers.some((cc) => cc.years.some((r) => r.year === y)))
                  .map((y) => {
                    const row = c.years.find((r) => r.year === y);
                    return (
                      <td key={y} className="num">
                        {row?.fuel?.ground.applied_percent != null ? `${row.fuel.ground.applied_percent}%` : "—"}
                        {row?.fuel?.ground.is_proxy && <span className="fuel-strip__proxy">*</span>}
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {fuelCarriers.some((c) => c.years.some((y) => y.fuel?.ground.is_proxy)) && (
        <p className="fuel-strip__foot">* Proxy: no published figure for that carrier and year, so FedEx’s published fuel history stands in. The rail’s fuel slider overrides every year.</p>
      )}
      {carriers.some((c) => !c.years.some((y) => y.fuel)) && <p className="fuel-strip__foot">USPS charges no fuel surcharge.</p>}
    </div>
  );

  return <ChartFrame title="Cost per parcel, year by year" summary={summary} chart={chart} table={table} aside={aside} />;
}
