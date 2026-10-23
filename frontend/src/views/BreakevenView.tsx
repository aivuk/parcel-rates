import { QuestionPlaceholder } from "./QuestionPlaceholder";
import { QUESTIONS, type ViewProps } from "./types";

export function BreakevenView(props: ViewProps) {
  return <QuestionPlaceholder def={QUESTIONS[1]!} parcels={props.parcels} />;
}
