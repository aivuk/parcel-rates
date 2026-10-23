import { useState } from "react";
import type { Quote, QuoteResponse, Tier } from "../../api/types";
import { TIERS } from "../../api/types";
import { carrierVar } from "../../lib/carriers";
import { CARRIER_NAME, TIER_NAME, formatUsd } from "../../lib/format";
import { dimDrivers, tierView } from "./quoteModel";
import { QuoteRow, shortService } from "./QuoteRow";
import { marginClass, marginText } from "./shared";

export interface QuoteAnswerProps {
  res: QuoteResponse;
  tier: Tier;
  flatPrice: number;
}

/** The answer: the cheapest service for the chosen speed, its total as the largest figure. */
export function QuoteAnswer({ res, tier, flatPrice }: QuoteAnswerProps) {
  const pick = res.cheapest_by_tier[tier];
  const best = pick && res.quotes.find((q) => q.service_id === pick.service_id && q.tier === tier);
  if (!pick || !best) {
    return (
      <div className="answer qa">
        <p className="kicker">Cheapest for this parcel · {TIER_NAME[tier]}</p>
        <p className="answer__figure qa__none">None</p>
        <p className="answer__caption">No {TIER_NAME[tier].toLowerCase()} service can carry this parcel. The reasons are listed below.</p>
      </div>
    );
  }
  const price = best.margin + best.total; // the price charged the server used (flat price or override)
  return (
    <div className="answer qa">
      <p className="kicker">Cheapest for this parcel · {TIER_NAME[tier]}</p>
      <p className="answer__figure qa__figure" data-testid="quote-answer">
        {formatUsd(best.total)}
      </p>
      <p className="qa__service">
        <span className="qa__carrier" style={{ color: carrierVar(best.carrier) }}>
          {CARRIER_NAME[best.carrier]}
        </span>{" "}
        {shortService(best)}
      </p>
      <p className={`qa__margin ${marginClass(best.margin)}`}>
        {marginText(best.margin)} <span className="qa__against">against your {formatUsd(Number.isFinite(price) ? price : flatPrice)} price</span>
      </p>
    </div>
  );
}

function DimNote({ quotes, actualLb }: { quotes: Quote[]; actualLb: number }) {
  const drivers = dimDrivers(quotes, actualLb);
  if (drivers.length === 0) return null;
  const heaviest = Math.max(...drivers.map((q) => q.billable_weight_lb ?? 0));
  return (
    <section className="qdim" aria-labelledby="qdim-title">
      <h3 id="qdim-title" className="kicker">
        Billed by size, not weight
      </h3>
      <p className="qdim__text">
        Carriers bill the larger of the actual weight and the dimensional weight (length × width × height ÷ the
        carrier's divisor), so this {actualLb} lb box is billed as up to {heaviest} lb.
      </p>
      <table className="qdim__table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col" className="num">
              Actual
            </th>
            <th scope="col" className="num">
              Dimensional
            </th>
            <th scope="col" className="num">
              Billable
            </th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((q) => (
            <tr key={q.service_id}>
              <th scope="row">{q.service_name}</th>
              <td className="num">{actualLb} lb</td>
              <td className="num">{q.dim_weight_lb} lb</td>
              <td className="num qdim__billable">{q.billable_weight_lb} lb</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export interface QuoteBreakdownProps {
  res: QuoteResponse;
  tier: Tier;
  actualLb: number;
  onTier: (t: Tier) => void;
}

/** The ranked list, the size note and the other speeds: everything that explains the answer. */
export function QuoteBreakdown({ res, tier, actualLb, onTier }: QuoteBreakdownProps) {
  const view = tierView(res, tier);
  const [openId, setOpenId] = useState<string | null>(null);
  const scale = Math.max(0, ...view.ranked.map((q) => q.total));
  const cheapest = view.ranked[0]?.total ?? 0;
  const others = TIERS.filter((t) => t !== tier);

  return (
    <div className="qbreak">
      <section aria-labelledby="qrank-title">
        <div className="qbreak__head">
          <h3 id="qrank-title" className="qbreak__title">
            Every carrier, {TIER_NAME[tier].toLowerCase()}
          </h3>
          <p className="qkey" aria-hidden="true">
            <span className="qkey__sw qkey__sw--base" /> base <span className="qkey__sw qkey__sw--surcharge" /> surcharges{" "}
            <span className="qkey__sw qkey__sw--fuel" /> fuel
          </p>
        </div>
        {view.ranked.length > 0 && (
          <ol className="qrank">
            {view.ranked.map((q, i) => (
              <QuoteRow
                key={q.service_id}
                quote={q}
                rank={i + 1}
                cheapest={cheapest}
                scale={scale}
                open={openId === q.service_id}
                onToggle={() => setOpenId(openId === q.service_id ? null : q.service_id)}
              />
            ))}
          </ol>
        )}
        {view.alternatives.length > 0 && (
          <p className="qalt">
            Also available, dearer:{" "}
            {view.alternatives.map((q, i) => (
              <span key={q.service_id}>
                {i > 0 && " · "}
                {q.service_name} {formatUsd(q.total)}
              </span>
            ))}
          </p>
        )}
        {view.unavailable.length > 0 && (
          <ul className="qunavail" aria-label="Services that cannot carry this parcel">
            {view.unavailable.map((q) => (
              <li key={q.service_id}>
                <span className="qunavail__name">{q.service_name}</span>
                <span className="qunavail__reason">Not available: {q.unavailable_reason ?? "no reason given"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DimNote quotes={res.quotes.filter((q) => q.tier === tier)} actualLb={actualLb} />

      <section className="qtiers" aria-labelledby="qtiers-title">
        <h3 id="qtiers-title" className="kicker">
          Other speeds, cheapest each
        </h3>
        <ul>
          {others.map((t) => {
            const pick = res.cheapest_by_tier[t];
            const q = pick && res.quotes.find((x) => x.service_id === pick.service_id && x.tier === t);
            return (
              <li key={t}>
                <span className="qtiers__tier">{TIER_NAME[t]}</span>
                <span className="qtiers__what">
                  {q ? (
                    <>
                      <span style={{ color: carrierVar(q.carrier) }}>{CARRIER_NAME[q.carrier]}</span> {shortService(q)}
                    </>
                  ) : (
                    "no service can carry it"
                  )}
                </span>
                <span className="qtiers__total">{pick ? formatUsd(pick.total) : "—"}</span>
                <button type="button" className="btn btn--quiet qtiers__go" onClick={() => onTier(t)}>
                  Quote {TIER_NAME[t].toLowerCase()}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
