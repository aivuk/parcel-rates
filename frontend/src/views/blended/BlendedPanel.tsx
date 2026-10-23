import { useMemo, useState } from "react";
import { useApi, useLoad } from "../../api/ApiContext";
import type { BlendedResponse, Carrier, Parcel, SegmentFilter } from "../../api/types";
import type { ControlsState } from "../../state/urlState";
import type { Meta } from "../../api/types";
import { formatInt, formatUsd } from "../../lib/format";
import { carrierVar } from "../../lib/carriers";
import { LoadProblem, NeedParcels, useLastData, type ParcelActions } from "./common";
import { blendedAnswer, cleanSegment, totalQuantity, type BlendedAnswer } from "./logic";
import { carrierName, pct0, signedUsd } from "./money";
import { SegmentChips, describeSegment } from "./SegmentChips";
import { CostSplitChart } from "./CostSplitChart";

export interface BlendedPanelProps extends ParcelActions {
  controls: ControlsState;
  meta: Meta | null;
  parcels: Parcel[] | null;
}

export function BlendedPanel({ controls, meta, parcels, onLoadSample, onUploadCsv }: BlendedPanelProps) {
  if (!parcels || parcels.length === 0) {
    return (
      <NeedParcels
        what="Load the sample mix or upload a CSV to see what each carrier costs per parcel across the whole set, how much of it is surcharges, and whether your shipping price covers it."
        onLoadSample={onLoadSample}
        onUploadCsv={onUploadCsv}
      />
    );
  }
  return <Blended controls={controls} meta={meta} parcels={parcels} />;
}

function Blended({ controls, meta, parcels }: { controls: ControlsState; meta: Meta | null; parcels: Parcel[] }) {
  const api = useApi();
  const [segment, setSegment] = useState<SegmentFilter>({});
  const clean = cleanSegment(segment);
  const controlsKey = JSON.stringify(controls);
  const segKey = JSON.stringify(clean);
  const state = useLoad(
    (signal) => api.blended({ parcels, controls, ...(clean ? { segment: clean } : {}) }, signal),
    [api, parcels, controlsKey, segKey],
  );
  const data = useLastData(state);
  const total = useMemo(() => totalQuantity(parcels), [parcels]);
  const loading = state.status === "loading";

  return (
    <div className="q3" aria-busy={loading}>
      {state.status === "error" && <LoadProblem error={state.error} />}
      {!data && loading && <p className="q-loading">Pricing {formatInt(total)} parcels with every carrier…</p>}
      {data && (
        <Body
          data={data}
          controls={controls}
          segment={clean}
          total={total}
          chips={
            <SegmentChips
              value={segment}
              onChange={setSegment}
              weightBands={meta?.segments.weight_bands}
              zoneBands={meta?.segments.zone_bands}
            />
          }
          stale={loading}
        />
      )}
    </div>
  );
}

function Body({
  data,
  controls,
  segment,
  total,
  chips,
  stale,
}: {
  data: BlendedResponse;
  controls: ControlsState;
  segment: SegmentFilter | null;
  total: number;
  chips: React.ReactNode;
  stale: boolean;
}) {
  const answer = blendedAnswer(data);
  const seg = describeSegment(segment);
  const scope = `${formatInt(data.parcels_considered)} ${segment ? `of ${formatInt(total)} ` : ""}parcels`;

  return (
    <div className={stale ? "q-stale" : undefined}>
      {answer ? (
        <Answer data={data} answer={answer} kicker={`Cheapest single carrier · ${data.year} prices · ${scope}${seg ? ` · ${seg}` : ""}`} />
      ) : (
        <div className="answer">
          <p className="kicker">{seg || "This selection"}</p>
          <p className="answer__figure answer__figure--empty">No parcels</p>
          <p className="answer__caption">None of your parcels fall in this segment. Choose “All” in a group to widen it.</p>
        </div>
      )}

      {answer && <Verdict data={data} answer={answer} controls={controls} />}

      <section className="q-block" aria-label="Filter by kind of parcel">
        <div className="q-block__head">
          <h3 className="q-block__title">Look at one kind of parcel</h3>
          <p className="q-count" role="status">
            <strong className="figure">{formatInt(data.parcels_considered)}</strong> of {formatInt(total)} parcels in
            this segment
            {answer && segment && (
              <span className="q-count__result" data-testid="q3-segment-result">
                {" "}
                · cheapest {carrierName(answer.cheapest.carrier)} {formatUsd(answer.cheapest.cost_per_parcel)},{" "}
                {signedUsd(answer.cheapest.margin_per_parcel)} {answer.cheapest.margin_per_parcel < 0 ? "loss" : "margin"} per parcel
              </span>
            )}
          </p>
        </div>
        {chips}
      </section>

      {answer && <CostSplitChart data={data} />}
      {answer && <Unavailable data={data} />}
    </div>
  );
}

function Answer({ data, answer, kicker }: { data: BlendedResponse; answer: BlendedAnswer; kicker: string }) {
  const { cheapest, others, mixSavingPerParcel, mixSavingTotal } = answer;
  const mix = data.best_mix;
  const mixCounts = Object.entries(mix.parcels_by_carrier)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <div className="answer q3-answer">
      <p className="kicker">{kicker}</p>
      <p className="answer__figure" data-testid="q3-answer">
        <span className="carrier-tag" style={{ color: carrierVar(cheapest.carrier) }}>
          {carrierName(cheapest.carrier)}
        </span>{" "}
        {formatUsd(cheapest.cost_per_parcel)}
        <span className="answer__unit"> per parcel</span>
      </p>
      <p className="answer__caption">
        Blended over every parcel at its cheapest {carrierName(cheapest.carrier)} service for the speed it needs.
        {others.length > 0 && " "}
        {others.map((c, i) => (
          <span key={c.carrier}>
            {i > 0 && ", "}
            <strong style={{ color: carrierVar(c.carrier) }}>{carrierName(c.carrier)}</strong> {formatUsd(c.cost_per_parcel)}{" "}
            ({signedUsd(c.cost_per_parcel - cheapest.cost_per_parcel)})
          </span>
        ))}
        {others.length > 0 && "."}
      </p>
      <div className="mix" data-testid="q3-mix">
        <p className="mix__line">
          <span className="mix__label">Best mix</span>{" "}
          <span className="figure mix__figure">{formatUsd(mix.cost_per_parcel)}</span> per parcel, choosing the cheapest
          carrier for each parcel:{" "}
          {mixSavingPerParcel > 0 ? (
            <>
              <strong>{formatUsd(mixSavingPerParcel)} less per parcel</strong> than {carrierName(cheapest.carrier)} alone (
              {formatUsd(mixSavingTotal)} on these parcels).
            </>
          ) : (
            <>no saving over {carrierName(cheapest.carrier)} alone.</>
          )}
        </p>
        <p className="mix__split">
          {mixCounts.map(([c, n], i) => (
            <span key={c}>
              {i > 0 && " · "}
              <span style={{ color: carrierVar(c as Carrier) }}>{carrierName(c)}</span> {formatInt(n)}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

function Verdict({ data, answer, controls }: { data: BlendedResponse; answer: BlendedAnswer; controls: ControlsState }) {
  const c = answer.cheapest;
  const loss = c.margin_per_parcel < 0;
  const charged = data.revenue_per_parcel;
  const mixedPrices = Math.abs(charged - controls.flat_price) >= 0.005;
  const rows = [
    ...[...data.carriers].filter((x) => x.parcels_shipped > 0).sort((a, b) => a.cost_per_parcel - b.cost_per_parcel),
  ];
  return (
    <section className={`verdict ${loss ? "verdict--loss" : "verdict--profit"}`} aria-labelledby="q3-verdict">
      <h3 id="q3-verdict" className="verdict__q">
        Does your {formatUsd(controls.flat_price)} shipping price cover the cost?
      </h3>
      <p className="verdict__figure" data-testid="q3-verdict">
        <span className="verdict__word">{loss ? "No." : "Yes."}</span>{" "}
        {loss ? (
          <>
            You lose {formatUsd(-c.margin_per_parcel)} per parcel with {carrierName(c.carrier)}
          </>
        ) : (
          <>
            {formatUsd(c.margin_per_parcel)} margin per parcel with {carrierName(c.carrier)}
          </>
        )}
      </p>
      <p className="verdict__loss-share" data-testid="q3-loss-share">
        {c.parcels_at_loss === 0 ? (
          <>
            Every parcel covers its cost with {carrierName(c.carrier)}
            {data.best_mix.parcels_at_loss > 0 && <>; {pct0(data.best_mix.loss_share)} would lose money with the best mix</>}.
          </>
        ) : (
          <>
            <strong>{pct0(c.loss_share)}</strong> of parcels ({formatInt(c.parcels_at_loss)} of {formatInt(c.parcels_shipped)})
            ship at a loss even with the cheapest carrier
            {data.best_mix.loss_share !== c.loss_share && <>; {pct0(data.best_mix.loss_share)} with the best mix</>}.
          </>
        )}
      </p>
      {mixedPrices && (
        <p className="verdict__note">
          You charge {formatUsd(charged)} per parcel on average: the flat {formatUsd(controls.flat_price)}, and your own
          price on rows that have one.
        </p>
      )}
      <table className="ledger-table margin-table">
        <caption className="visually-hidden">Margin per parcel and share shipped at a loss, per carrier</caption>
        <thead>
          <tr>
            <th scope="col">Carrier</th>
            <th scope="col" className="num">
              Cost / parcel
            </th>
            <th scope="col" className="num">
              Margin / parcel
            </th>
            <th scope="col">Shipped at a loss</th>
          </tr>
        </thead>
        <tbody>
          {[...rows.map((r) => ({ key: r.carrier as string, name: carrierName(r.carrier), color: carrierVar(r.carrier), s: r })),
            { key: "mix", name: "Best mix", color: "var(--ink)", s: data.best_mix }].map(({ key, name, color, s }) => (
            <tr key={key} data-testid={`margin-${key}`}>
              <th scope="row" style={{ color }}>
                {name}
              </th>
              <td className="num">{formatUsd(s.cost_per_parcel)}</td>
              <td className={`num ${s.margin_per_parcel < 0 ? "money--loss" : "money--profit"}`}>
                {signedUsd(s.margin_per_parcel)} {s.margin_per_parcel < 0 ? "loss" : "margin"}
              </td>
              <td>
                <span className="meter" aria-hidden="true">
                  <span className="meter__fill" style={{ transform: `scaleX(${s.loss_share})` }} />
                </span>
                <span className="meter__text">{pct0(s.loss_share)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Unavailable({ data }: { data: BlendedResponse }) {
  const gaps = data.carriers.filter((c) => c.parcels_unavailable > 0);
  if (gaps.length === 0 && data.best_mix.parcels_unavailable === 0) return null;
  return (
    <div className="q-notes" role="note">
      <p className="kicker">Parcels a carrier cannot ship</p>
      <ul>
        {gaps.map((c) => (
          <li key={c.carrier}>
            <strong style={{ color: carrierVar(c.carrier) }}>{carrierName(c.carrier)}</strong> cannot ship{" "}
            {formatInt(c.parcels_unavailable)} of these parcels at the speed they need; its cost per parcel covers the
            other {formatInt(c.parcels_shipped)}, so compare with care.
          </li>
        ))}
        {data.best_mix.parcels_unavailable > 0 && (
          <li>{formatInt(data.best_mix.parcels_unavailable)} parcels cannot be shipped by any carrier.</li>
        )}
      </ul>
    </div>
  );
}
