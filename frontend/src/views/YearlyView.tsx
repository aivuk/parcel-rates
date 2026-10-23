import { QuestionPlaceholder } from "./QuestionPlaceholder";
import { QUESTIONS, type ViewProps } from "./types";

export function YearlyView(props: ViewProps) {
  return <QuestionPlaceholder def={QUESTIONS[3]!} parcels={props.parcels} />;
}
