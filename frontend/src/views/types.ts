import type { Controls, Meta, Parcel } from "../api/types";
import type { ViewId } from "../state/urlState";

/** What every question view receives. Issues #5 and #6 implement views against this. */
export interface ViewProps {
  controls: Controls;
  meta: Meta | null;
  /** The loaded parcel set, or null when none is loaded (Q3, Q4 need one). */
  parcels: Parcel[] | null;
}

export interface QuestionDef {
  id: ViewId;
  number: number;
  short: string;
  question: string;
  answerSlot: string;
  needsParcels: boolean;
  issue: number;
}

export const QUESTIONS: readonly QuestionDef[] = [
  {
    id: "quote",
    number: 1,
    short: "Quote a parcel",
    question:
      "For one parcel, which service is cheapest once surcharges are included, and what are the line items of that price?",
    answerSlot: "Cheapest service per carrier for the chosen speed, ranked, with base, each surcharge, fuel, and the margin against your flat price.",
    needsParcels: false,
    issue: 5,
  },
  {
    id: "breakeven",
    number: 2,
    short: "Breakeven map",
    question: "Where does USPS stop being cheaper than UPS or FedEx ground, by weight and distance?",
    answerSlot: "A weight × distance map coloured by the winning ground carrier, with the breakeven lines in plain words.",
    needsParcels: false,
    issue: 5,
  },
  {
    id: "blended",
    number: 3,
    short: "Blended cost",
    question:
      "Across all your parcels, what does each carrier cost per parcel, and how much of that is surcharges rather than base rate?",
    answerSlot: "Blended cost per parcel per carrier, base vs surcharges vs fuel, margin against your price and the share shipped at a loss.",
    needsParcels: true,
    issue: 6,
  },
  {
    id: "yearly",
    number: 4,
    short: "Year over year",
    question:
      "How did that cost change each year under the published prices, against the increase carriers announced, and which parcels drove it?",
    answerSlot: "Cost per parcel per carrier per year against the announced increase, the segments that drove each change, and a projection for next year.",
    needsParcels: true,
    issue: 6,
  },
] as const;
