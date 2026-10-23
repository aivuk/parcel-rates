import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { YearlyView } from "../YearlyView";
import { YearlyPanel } from "./YearlyPanel";
import { mockYearlyResponse } from "../../api/mocks";
import type { CarrierYears, Driver } from "../../api/types";
import { controls, meta, renderWith, sampleParcels, spyClient, stubResizeObserver } from "../blended/testUtils";
import {
  announcedPath,
  biggestFuelStep,
  defaultIncrease,
  driverSentence,
  fuelSentence,
  periodChange,
  pickCarrier,
  pointNotes,
  readableWarning,
  referenceYear,
  sortedDrivers,
  strongestDimension,
  withinChange,
  fastestSegment,
} from "./logic";
import { toIndex } from "./YearChart";
import { niceTicks } from "./DriverChart";

beforeEach(() => stubResizeObserver());

const carrier = (c: string) => mockYearlyResponse.carriers.find((x) => x.carrier === c) as CarrierYears;

describe("YearlyView", () => {
  it("asks for parcels when none are loaded", async () => {
    const { client, yearly } = spyClient();
    const onLoadSample = vi.fn();
    renderWith(client, <YearlyPanel controls={controls} meta={meta} parcels={null} onLoadSample={onLoadSample} />);
    await userEvent.click(screen.getByRole("button", { name: "Load the sample mix" }));
    expect(onLoadSample).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Upload CSV" })).toBeInTheDocument();
    expect(yearly).not.toHaveBeenCalled();
  });

  it("answers with the cheapest carrier's change since the first year, against the announced increases", async () => {
    const { client } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    expect(await screen.findByTestId("q4-answer")).toHaveTextContent(/^USPS \+18\.5% since 2023$/);
    const caption = screen.getByTestId("q4-caption");
    expect(caption).toHaveTextContent("$17.80 → $21.09 per parcel from 2023 to 2026 (+$3.29)");
    expect(caption).toHaveTextContent("compound to +16.4% over the same years");
    expect(caption).toHaveTextContent("2.1 points more than announced");
    expect(screen.getByText(/Same years for the others/)).toHaveTextContent("UPS +28.7% (announced +18.8%) · FedEx +28.2%");
  });

  it("starts the next-year slider at the latest announced increase and sends it", async () => {
    const { client, yearly } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    const slider = await screen.findByRole("slider", { name: /increase for 2027/i });
    await waitFor(() => expect(slider).toHaveValue("6.5"));
    expect(yearly.mock.calls[0]![0]).not.toHaveProperty("next_year_increase_percent");
    await waitFor(() => expect(yearly.mock.lastCall![0].next_year_increase_percent).toBe(6.5));
    expect(screen.getByTestId("q4-projection")).toHaveTextContent("$22.46 per parcel with USPS in 2027, from $21.09 in 2026 (+$1.37)");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(slider, { target: { value: "10" } });
    expect(screen.getByTestId("q4-projection")).toHaveTextContent("$23.20");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => expect(yearly.mock.lastCall![0].next_year_increase_percent).toBe(10));
    expect(screen.getByRole("button", { name: "Reset to +6.5%" })).toBeInTheDocument();
  });

  it("shows how much of the change is fuel", async () => {
    const { client } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    const note = await screen.findByTestId("fuel-note");
    expect(note).toHaveTextContent(
      "UPS 2025→2026: +$4.61 per parcel, of which fuel +$2.69 (58% of it); the ground fuel surcharge went from 20.5% to 26.25%.",
    );
    expect(note).toHaveTextContent("USPS charges no fuel surcharge.");
    const strip = within(note).getByRole("table", { name: /fuel surcharge applied/i });
    expect(within(strip).getByRole("row", { name: /^FedEx/ })).toHaveTextContent("18%16.25%20.5%26.25%26.25%*");
  });

  it("shows the response warnings and mid-year editions next to the points", async () => {
    const { client } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    const notes = await screen.findByTestId("point-notes");
    expect(notes).toHaveTextContent(/FedEx 2027 \(incomplete data\): No 2027 rules recorded for handling: length/);
    expect(notes).toHaveTextContent(/remote area.*Surcharges may be understated\./);
    expect(notes).toHaveTextContent("UPS 2024: Priced from the edition effective 1 Jul 2024, published mid-year");
    expect(notes).toHaveTextContent("UPS 2026: Priced from the edition effective 7 Sep 2026");
    expect(notes).not.toHaveTextContent("FedEx 2024");
  });

  it("breaks the change down by segment, sorted, with a sentence naming the top driver", async () => {
    const { client } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    await screen.findByTestId("q4-answer");
    await userEvent.click(within(screen.getByRole("group", { name: "Carrier" })).getByRole("button", { name: "UPS" }));
    expect(within(screen.getByRole("group", { name: "Between" })).getByRole("button", { name: "2025→2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("driver-sentence")).toHaveTextContent(
      "Largest contributor: deliveries to homes (224 of them) added $3.59 per parcel of UPS's +$4.61 change from 2025 to 2026, 78% of it. Its own parcels also changed fastest: +$4.81 each.",
    );
    await userEvent.click(within(screen.getByRole("group", { name: "Split by" })).getByRole("button", { name: "Weight" }));
    const fig = screen.getByRole("figure", { name: /what drove ups.s change, by weight/i });
    await userEvent.click(within(fig).getByRole("button", { name: "Show as table" }));
    const rows = within(within(fig).getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual([
      "1–5 lb181+$2.40+$3.98+$720.40",
      "10–20 lb57+$1.39+$7.32+$417.19",
      "5–10 lb40+$0.62+$4.68+$187.38",
      "≤1 lb22+$0.20+$2.67+$58.64",
      "All parcels300+$4.61+$4.61—",
    ]);
  });

  it("switches the year chart between dollars and an index, desktop default dollars", async () => {
    const { client } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    await screen.findByTestId("q4-answer");
    const scale = screen.getByRole("group", { name: "Scale" });
    expect(within(scale).getByRole("button", { name: "Dollars" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(scale).getByRole("button", { name: /index/i }));
    expect(within(scale).getByRole("button", { name: /index/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/each carrier's first year = 100/)).toBeInTheDocument();
  });

  it("offers the year chart as a table with every year and the projection", async () => {
    const { client } = spyClient();
    renderWith(client, <YearlyView controls={controls} meta={meta} parcels={sampleParcels} />);
    await screen.findByTestId("q4-answer");
    const fig = screen.getByRole("figure", { name: /cost per parcel, year by year/i });
    expect(fig).toHaveTextContent(/USPS \(circles\) went from \$17\.80 in 2023 to \$21\.09 in 2026 \(\+18\.5%\)/);
    await userEvent.click(within(fig).getByRole("button", { name: "Show as table" }));
    const table = within(fig).getByRole("table", { name: /cost per parcel by carrier and year/i });
    expect(within(table).getByRole("row", { name: /FedEx 2027 \(see note\)/ })).toHaveTextContent("$44.05");
    expect(within(table).getByRole("row", { name: /USPS 2027 \(projected\)/ })).toHaveTextContent("$22.33");
    expect(within(table).getByRole("row", { name: /USPS 2026/ })).toHaveTextContent("$21.09118.5");
  });
});

describe("yearly logic", () => {
  it("compares carriers at the latest year they all publish", () => {
    expect(referenceYear(mockYearlyResponse)).toBe(2026);
    expect(pickCarrier(mockYearlyResponse, 2026)!.carrier).toBe("usps");
    expect(defaultIncrease(carrier("usps"))).toBe(6.5);
  });

  it("computes the period change and compounds the announced increases", () => {
    const ch = periodChange(carrier("usps"), 2026)!;
    expect(ch.dollars).toBe(3.29);
    expect(ch.percent).toBeCloseTo(18.483, 2);
    expect(ch.announcedPercent).toBeCloseTo((1.0567 * 1.0343 * 1.065 - 1) * 100, 6);
    const path = announcedPath(carrier("usps"));
    expect(path.get(2023)).toBe(17.8);
    expect(path.get(2024)).toBe(18.81);
  });

  it("finds the biggest step and its fuel share", () => {
    const s = biggestFuelStep(carrier("fedex"), 2026)!;
    expect([s.fromYear, s.toYear, s.change, s.fuelChange]).toEqual([2025, 2026, 4.55, 2.72]);
    expect(fuelSentence(s)).toContain("(60% of it)");
    expect(biggestFuelStep(carrier("usps"))).toBeNull();
  });

  it("sorts drivers by magnitude, negatives included", () => {
    const list: Driver[] = [
      { segment: "a", parcels: 1, change_per_parcel: 0.2, change_total: 1 },
      { segment: "b", parcels: 1, change_per_parcel: -0.9, change_total: 1 },
      { segment: "c", parcels: 1, change_per_parcel: 0.5, change_total: 1 },
    ];
    expect(sortedDrivers(list).map((d) => d.segment)).toEqual(["b", "c", "a"]);
  });

  it("names the top driver and picks the dimension it lives in", () => {
    const row = carrier("ups").years.find((y) => y.year === 2026)!;
    expect(strongestDimension(row.drivers!)).toBe("residential");
    expect(driverSentence("ups", row, "speed")).toBe(
      "Largest contributor: ground parcels (262 of them) added $2.98 per parcel of UPS's +$4.61 change from 2025 to 2026, 65% of it. " +
        "Fastest rising: next day parcels, +$21.13 each, but they are only 3% of the parcels (9), so they move the average less.",
    );
  });

  it("turns warnings into plain words and flags mid-year editions", () => {
    expect(readableWarning("No 2027 rules recorded for: oversize, delivery_area; surcharges may be understated")).toBe(
      "No 2027 rules recorded for oversize, remote area. Surcharges may be understated.",
    );
    const notes = pointNotes(mockYearlyResponse);
    expect(notes.filter((n) => n.kind === "edition").map((n) => `${n.carrier} ${n.year}`)).toEqual([
      "usps 2023",
      "ups 2024",
      "ups 2026",
    ]);
    expect(notes.filter((n) => n.kind === "warning").map((n) => `${n.carrier} ${n.year}`)).toEqual(["fedex 2027"]);
  });

  it("derives the change within a segment from its total and parcel count", () => {
    const d: Driver = { segment: "next_day", parcels: 9, change_per_parcel: 0.63, change_total: 190.2 };
    expect(withinChange(d)).toBe(21.13);
    expect(withinChange({ ...d, parcels: 0 })).toBe(0);
    const row = carrier("ups").years.find((y) => y.year === 2026)!;
    expect(fastestSegment(row.drivers!.weight_band, 4.61)!.segment).toBe("10–20");
  });

  it("indexes to the first year", () => {
    expect(toIndex(21.09, 17.8)).toBe(118.5);
  });

  it("makes round axis ticks that include zero", () => {
    expect(niceTicks(0, 1.77)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(niceTicks(-0.3, 1)).toContain(0);
  });
});
