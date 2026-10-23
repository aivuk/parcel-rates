import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { ViewId } from "../state/urlState";
import { QUESTIONS } from "../views/types";

export interface QuestionTabsProps {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  renderPanel: (id: ViewId) => ReactNode;
  /** Shares the tab row: the parcel set's heading on the left, its actions on the right. */
  barStart?: ReactNode;
  barEnd?: ReactNode;
  /** Between the tab row and the panel: the parcel details and problems. */
  belowBar?: ReactNode;
}

const tabId = (id: ViewId) => `tab-${id}`;
const panelId = (id: ViewId) => `panel-${id}`;

/** WAI-ARIA tabs with automatic activation; arrow keys, Home and End move between questions. */
export function QuestionTabs({ active, onSelect, renderPanel, barStart, barEnd, belowBar }: QuestionTabsProps) {
  const refs = useRef<Partial<Record<ViewId, HTMLButtonElement | null>>>({});
  const activeDef = QUESTIONS.find((q) => q.id === active) ?? QUESTIONS[0]!;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = QUESTIONS.findIndex((q) => q.id === active);
    const last = QUESTIONS.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    const id = QUESTIONS[next]!.id;
    onSelect(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="questions">
      <div className="questions__bar">
        {barStart && <div className="questions__bar-start">{barStart}</div>}
        <div className="questions__tabs" role="tablist" aria-label="Questions" onKeyDown={onKeyDown}>
          {QUESTIONS.map((q) => (
            <button
              key={q.id}
              ref={(el) => {
                refs.current[q.id] = el;
              }}
              id={tabId(q.id)}
              type="button"
              role="tab"
              aria-selected={q.id === active}
              aria-controls={panelId(q.id)}
              tabIndex={q.id === active ? 0 : -1}
              className="questions__tab"
              onClick={() => onSelect(q.id)}
            >
              <span className="questions__num">{String(q.number).padStart(2, "0")}</span>
              <span className="questions__short">{q.short}</span>
            </button>
          ))}
        </div>
        {barEnd && <div className="questions__bar-end">{barEnd}</div>}
      </div>
      {belowBar}
      <section
        id={panelId(activeDef.id)}
        role="tabpanel"
        aria-labelledby={tabId(activeDef.id)}
        className="questions__panel"
        tabIndex={0}
      >
        <p className="kicker">Question {activeDef.number}</p>
        <h2 className="questions__question">{activeDef.question}</h2>
        {renderPanel(activeDef.id)}
      </section>
    </div>
  );
}
