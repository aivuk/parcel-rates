import { useEffect, useMemo, useState } from "react";
import { useApi, useLoad } from "../api/ApiContext";
import { ApiError } from "../api/client";
import type { QuoteResponse } from "../api/types";
import { CARRIER_NAME } from "../lib/format";
import { draftToParcel, DEFAULT_DRAFT, type Draft } from "./quote/draft";
import { QuoteForm } from "./quote/QuoteForm";
import { problemsByField, zonesByCarrier, type FormField } from "./quote/quoteModel";
import { QuoteAnswer, QuoteBreakdown } from "./quote/QuoteResult";
import { carriersForYear, missingCarriersNote, useDebounced } from "./quote/shared";
import type { ViewProps } from "./types";
import "./quote/shared.css";
import "./quote/quote.css";

export interface QuoteViewProps extends ViewProps {
  /** Wait this long after the last keystroke before asking for a quote. */
  debounceMs?: number;
  initialDraft?: Draft;
}

export function QuoteView({ controls, meta, parcels, debounceMs = 300, initialDraft = DEFAULT_DRAFT }: QuoteViewProps) {
  const api = useApi();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [attempt, setAttempt] = useState(0);
  const built = useMemo(() => draftToParcel(draft), [draft]);
  const requestKey = built.parcel ? JSON.stringify({ parcel: built.parcel, controls }) : null;
  const settledKey = useDebounced(requestKey, debounceMs);

  const state = useLoad<QuoteResponse>(
    settledKey ? (signal) => api.quote(JSON.parse(settledKey), signal) : null,
    [api, settledKey, attempt],
  );

  // Keep the last answer on screen (dimmed) while the next one loads, so typing does not flash.
  const [last, setLast] = useState<{ key: string; data: QuoteResponse } | null>(null);
  useEffect(() => {
    if (state.status === "ok" && settledKey) setLast({ key: settledKey, data: state.data });
  }, [state, settledKey]);

  const apiError = state.status === "error" ? state.error : null;
  const serverProblems = apiError instanceof ApiError && apiError.status === 422 ? problemsByField(apiError.problems) : null;
  const errors: Partial<Record<FormField, string[]>> = { ...(serverProblems?.byField ?? {}) };
  for (const [k, v] of Object.entries(built.errors ?? {})) errors[k as FormField] = [v];

  const pending = requestKey !== settledKey || state.status === "loading";
  const shown = state.status === "ok" ? state.data : apiError ? null : (last?.data ?? null);
  const stale = shown !== null && (pending || last?.key !== requestKey);
  const actualLb = built.parcel?.weight_lb ?? 0;

  const available = carriersForYear(meta, controls.year);
  const yearNote = missingCarriersNote(available, controls.year, CARRIER_NAME);
  const blocked = built.errors !== null || serverProblems !== null;

  return (
    <div className="qv">
      {yearNote && (
        <p className="view-note" role="note">
          {yearNote}
        </p>
      )}

      <div className="qv__answer" aria-live="polite" aria-busy={pending}>
        {blocked ? (
          <div className="answer qa">
            <p className="kicker">Cheapest for this parcel</p>
            <p className="answer__figure qa__none">$—.——</p>
            <p className="answer__caption">Fix the input marked in “Your parcel” to see the price.</p>
          </div>
        ) : apiError ? (
          <div className="view-error" role="alert">
            <p className="view-error__title">The quote could not be priced.</p>
            <p>{apiError.message}</p>
            <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : shown ? (
          <div className={stale ? "is-stale" : undefined}>
            <QuoteAnswer res={shown} tier={draft.speed} flatPrice={controls.flat_price} />
          </div>
        ) : (
          <div className="answer qa" data-testid="quote-loading">
            <p className="kicker">Cheapest for this parcel</p>
            <p className="answer__figure skeleton skeleton--figure" aria-label="Pricing…">
              $00.00
            </p>
            <p className="skeleton skeleton--line" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="qv__grid">
        <QuoteForm
          draft={draft}
          onChange={setDraft}
          errors={errors}
          zones={shown && !stale ? zonesByCarrier(shown.quotes) : null}
          parcels={parcels}
        />
        <div className="qv__detail">
          {serverProblems && serverProblems.other.length > 0 && (
            <ul className="view-error" role="alert">
              {serverProblems.other.map((p, i) => (
                <li key={i}>{p.field ? `${p.field}: ${p.message}` : p.message}</li>
              ))}
            </ul>
          )}
          {shown && !blocked ? (
            <div className={stale ? "is-stale" : undefined}>
              <QuoteBreakdown
                res={shown}
                tier={draft.speed}
                actualLb={actualLb}
                onTier={(t) => setDraft({ ...draft, speed: t })}
              />
            </div>
          ) : !apiError && !blocked ? (
            <div className="skeleton-rows" aria-hidden="true">
              <span className="skeleton skeleton--row" />
              <span className="skeleton skeleton--row" />
              <span className="skeleton skeleton--row" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
