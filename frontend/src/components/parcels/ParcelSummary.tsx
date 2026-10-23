import type { Bucket, ParcelSummary as Summary } from "../../lib/summary";
import { TIERS } from "../../api/types";
import { TIER_NAME, formatInt, formatShare } from "../../lib/format";

function MiniBars({ title, unit, buckets }: { title: string; unit: string; buckets: Bucket[] }) {
  const max = Math.max(...buckets.map((b) => b.share), 0.0001);
  return (
    <figure className="minibars">
      <figcaption className="kicker">{title}</figcaption>
      <table className="minibars__table">
        <caption className="visually-hidden">
          Parcels by {title.toLowerCase()}, share of the set
        </caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.label}>
              <th scope="row">
                {b.label}
                {unit && <span className="minibars__unit"> {unit}</span>}
                {b.detail && <span className="minibars__detail">{b.detail}</span>}
              </th>
              <td className="minibars__bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${b.share / max})` }} />
              </td>
              <td className="minibars__value">
                {formatShare(b.share)}
                <span className="visually-hidden"> ({formatInt(b.count)} parcels)</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function ParcelSummary({ summary }: { summary: Summary }) {
  return (
    <div className="summary">
      <dl className="summary__facts">
        <div className="summary__lead">
          <dt className="kicker">Parcels in the set</dt>
          <dd className="figure summary__count">{formatInt(summary.parcels)}</dd>
          <dd className="summary__sub">
            {formatInt(summary.rows)} row{summary.rows === 1 ? "" : "s"} · mean {summary.meanWeightLb.toFixed(1)} lb
          </dd>
        </div>
        <div>
          <dt className="kicker">To homes</dt>
          <dd className="figure summary__fact">{formatShare(summary.residentialShare)}</dd>
          <dd className="summary__sub">residential addresses</dd>
        </div>
        <div>
          <dt className="kicker">Speed</dt>
          <dd className="summary__tiers">
            {TIERS.map((t) => (
              <span key={t}>
                <span className="summary__tier-share">{formatShare(summary.byTier[t])}</span> {TIER_NAME[t]}
              </span>
            ))}
          </dd>
        </div>
        {summary.withOwnPrice > 0 && (
          <div className="summary__wide">
            <dt className="visually-hidden">Own price</dt>
            <dd className="summary__note">
              <strong>{formatInt(summary.withOwnPrice)}</strong> parcel{summary.withOwnPrice === 1 ? " has its" : "s have their"}{" "}
              own price, which overrides the flat price.
            </dd>
          </div>
        )}
      </dl>
      <div className="summary__dists">
        <MiniBars title="Weight" unit="lb" buckets={summary.weight} />
        <MiniBars title="Distance, USPS zone" unit="" buckets={summary.distance} />
      </div>
    </div>
  );
}
