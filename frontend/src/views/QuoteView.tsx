import { QuestionPlaceholder } from "./QuestionPlaceholder";
import { QUESTIONS, type ViewProps } from "./types";

export function QuoteView(props: ViewProps) {
  return <QuestionPlaceholder def={QUESTIONS[0]!} parcels={props.parcels} />;
}
