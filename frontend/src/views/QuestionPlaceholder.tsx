import type { QuestionDef, ViewProps } from "./types";

/** Placeholder for a question view; replaced by issues #5 (Q1, Q2) and #6 (Q3, Q4). */
export function QuestionPlaceholder({ def, parcels }: { def: QuestionDef } & Pick<ViewProps, "parcels">) {
  const blocked = def.needsParcels && !parcels;
  return (
    <div className="answer-slot" data-testid={`placeholder-${def.id}`}>
      <div className="answer">
        <p className="kicker">{def.answerLabel}</p>
        <p className="answer__figure answer-slot__figure" aria-label="Not computed yet">
          {def.answerBlank}
        </p>
      </div>
      <p className="answer-slot__text">{def.answerSlot}</p>
      {blocked && <p className="answer-slot__need">Load your parcels above first: this question prices your whole mix.</p>}
      <p className="answer-slot__note">View in progress (issue #{def.issue}).</p>
    </div>
  );
}
