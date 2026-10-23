import { useId } from "react";
import type { Quote } from "../../api/types";
import { carrierVar, carrierWashVar } from "../../lib/carriers";
import { CARRIER_NAME, formatUsd } from "../../lib/format";
import { splitOf } from "./quoteModel";

/** Base, surcharges and fuel as one bar; widths are shares of `scale` (the dearest row's total). */
export function StackedBar({ quote, scale }: { quote: Quote; scale: number }) {
  const s = splitOf(quote.line_items);
  const pct = (n: number) => `${scale > 0 ? (n / scale) * 100 : 0}%`;
  const c = quote.carrier;
  const label = `Base ${formatUsd(s.base)}, surcharges ${formatUsd(s.surcharges)}, fuel ${formatUsd(s.fuel)}`;
  return (
    <span className="qbar" role="img" aria-label={label} title={label}>
      <span className="qbar__part qbar__part--base" style={{ width: pct(s.base), background: carrierVar(c) }} />
      <span
        className="qbar__part qbar__part--surcharge"
        style={{
          width: pct(s.surcharges),
          backgroundImage: `repeating-linear-gradient(135deg, ${carrierVar(c)} 0 2px, ${carrierWashVar(c)} 2px 5px)`,
        }}
      />
      <span
        className="qbar__part qbar__part--fuel"
        style={{ width: pct(s.fuel), background: carrierWashVar(c), borderColor: carrierVar(c) }}
      />
    </span>
  );
}

/** "UPS Ground" -> "Ground" when the carrier name is already shown beside it. */
export const shortService = (q: Pick<Quote, "carrier" | "service_name">) =>
  q.service_name.replace(new RegExp(`^${CARRIER_NAME[q.carrier]} `), "");

export interface QuoteRowProps {
  quote: Quote;
  rank: number;
  cheapest: number;
  scale: number;
  open: boolean;
  onToggle: () => void;
}

export function QuoteRow({ quote, rank, cheapest, scale, open, onToggle }: QuoteRowProps) {
  const panelId = useId();
  const delta = quote.total - cheapest;
  const s = splitOf(quote.line_items);
  return (
    <li className={`qr ${open ? "qr--open" : ""}`}>
      <button type="button" className="qr__head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="qr__rank" aria-hidden="true">
          {rank}
        </span>
        <span className="qr__who">
          <span className="qr__carrier" style={{ color: carrierVar(quote.carrier) }}>
            {CARRIER_NAME[quote.carrier]}
          </span>
          <span className="qr__service">{shortService(quote)}</span>
        </span>
        <span className="qr__bar">
          <StackedBar quote={quote} scale={scale} />
        </span>
        <span className="qr__money">
          <span className="qr__total">{formatUsd(quote.total)}</span>
          <span className="qr__delta">{rank === 1 ? "cheapest" : `+${formatUsd(delta)}`}</span>
        </span>
        <span className="qr__chev" aria-hidden="true" />
        <span className="visually-hidden">{open ? ", hide line items" : ", show line items"}</span>
      </button>
      <div id={panelId} className="qr__panel" hidden={!open}>
        <table className="qitems">
          <caption className="visually-hidden">
            Line items of {quote.service_name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="num">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.line_items.map((li, i) => (
              <tr key={i} className={`qitems__row qitems__row--${li.kind}`}>
                <th scope="row">
                  <span className="qitems__kind">{li.kind === "base" ? "Base" : li.kind === "fuel" ? "Fuel" : "Surcharge"}</span>
                  <span className="qitems__label">{li.label}</span>
                  {li.source && <cite className="qitems__src">{li.source}</cite>}
                </th>
                <td className="num">{formatUsd(li.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total{" "}
                <span className="qitems__sub">
                  base {formatUsd(s.base)} · surcharges {formatUsd(s.surcharges)} · fuel {formatUsd(s.fuel)}
                </span>
              </th>
              <td className="num">{formatUsd(quote.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="qr__facts">
          Zone {quote.zone ?? "—"} · billed as {quote.billable_weight_lb ?? "—"} lb
          {quote.dim_weight_lb !== null ? ` (dimensional weight ${quote.dim_weight_lb} lb)` : ""}
          {quote.as_of ? ` · rules as of ${quote.as_of}` : ""}
        </p>
      </div>
    </li>
  );
}
