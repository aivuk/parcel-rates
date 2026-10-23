import { QuestionPlaceholder } from "./QuestionPlaceholder";
import { QUESTIONS, type ViewProps } from "./types";

export function BlendedView(props: ViewProps) {
  return <QuestionPlaceholder def={QUESTIONS[2]!} parcels={props.parcels} />;
}
