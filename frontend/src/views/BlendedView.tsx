import { BlendedPanel } from "./blended/BlendedPanel";
import type { ViewProps } from "./types";
import "./blended/blended.css";

/** Question 3: blended cost per carrier for the owner's parcel set (issue #6). */
export function BlendedView(props: ViewProps) {
  return <BlendedPanel controls={props.controls} meta={props.meta} parcels={props.parcels} />;
}
