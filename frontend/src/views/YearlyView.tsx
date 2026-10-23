import { YearlyPanel } from "./yearly/YearlyPanel";
import type { ViewProps } from "./types";
import "./yearly/yearly.css";

/** Question 4: year-over-year change of the blended cost (issue #6). */
export function YearlyView(props: ViewProps) {
  return <YearlyPanel {...props} />;
}
