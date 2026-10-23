import type { ViewId } from "../state/urlState";
import { QUESTIONS } from "./types";

/** The full question in plain words, as a muted caption under the answer. The heading above
 *  the answer is the short form, so the long sentence costs no space before the number. */
export function FullQuestion({ id }: { id: ViewId }) {
  const def = QUESTIONS.find((q) => q.id === id);
  return def ? <p className="answer__question">{def.question}</p> : null;
}
