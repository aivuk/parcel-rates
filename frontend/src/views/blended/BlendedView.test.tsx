import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlendedView } from "../BlendedView";
import { BlendedPanel } from "./BlendedPanel";
import { mockBlendedResponse } from "../../api/mocks";
import { cleanSegment, surchargeKinds, blendedAnswer, OTHER_KIND, splitRows } from "./logic";
import { CARRIER_NAME } from "../../lib/format";
import type { BlendedResponse } from "../../api/types";
import { controls, meta, renderWith, sampleParcels, spyClient, stubResizeObserver } from "./testUtils";

beforeEach(() => stubResizeObserver());

describe("BlendedView", () => {
  it("asks for parcels with sample and upload actions when none are loaded", async () => {
    const { client, blended } = spyClient();
    const onLoadSample = vi.fn();
    const onUploadCsv = vi.fn();
    renderWith(client, <BlendedPanel controls={controls} meta={meta} parcels={null} onLoadSample={onLoadSample} onUploadCsv={onUploadCsv} />);
    await userEvent.click(screen.getByRole("button", { name: "Load the sample mix" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload CSV" }));
    expect(onLoadSample).toHaveBeenCalledOnce();
    expect(onUploadCsv).toHaveBeenCalledOnce();
    expect(blended).not.toHaveBeenCalled();
  });

  it("without handlers, the empty-state buttons drive the parcel panel's own controls", async () => {
    const { client } = spyClient();
    const panelSample = vi.fn();
    renderWith(
      client,
      <>
        <section className="parcels">
          <button type="button" onClick={panelSample}>
            Load sample mix
          </button>
        </section>
        <BlendedView controls={controls} meta={meta} parcels={null} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Load the sample mix" }));
    expect(panelSample).toHaveBeenCalledOnce();
  });

  it("puts the cheapest carrier's cost per parcel first, with the best mix saving", async () => {
    const { client, blended } = spyClient();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    expect(await screen.findByTestId("q3-answer")).toHaveTextContent(/^USPS \$21\.09 per parcel$/);
    expect(blended).toHaveBeenCalledWith(expect.objectContaining({ parcels: sampleParcels, controls }), expect.anything());
    expect(blended.mock.calls[0]![0]).not.toHaveProperty("segment");
    const mix = screen.getByTestId("q3-mix");
    expect(mix).toHaveTextContent("$19.98");
    expect(mix).toHaveTextContent("$1.11 less per parcel than USPS alone ($332.12 on these parcels)");
    expect(mix).toHaveTextContent("USPS 275 · FedEx 15 · UPS 10");
  });

  it("says plainly whether the flat price covers the cost and how many parcels lose money", async () => {
    const { client } = spyClient();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    expect(await screen.findByTestId("q3-verdict")).toHaveTextContent("No. You lose $10.98 per parcel with USPS");
    expect(screen.getByTestId("q3-loss-share")).toHaveTextContent("71% of parcels (214 of 300) ship at a loss");
    expect(screen.getByRole("heading", { name: /does your \$9\.99 shipping price cover the cost/i })).toBeInTheDocument();
    const ups = screen.getByTestId("margin-ups");
    expect(ups).toHaveTextContent("−$32.57 loss");
    expect(ups).toHaveTextContent("100%");
    expect(within(ups).getByText("−$32.57 loss")).toHaveClass("money--loss");
    expect(screen.getByText(/You charge \$10\.11 per parcel on average/)).toBeInTheDocument();
  });

  it("shows a margin, not a loss, when the price covers the cost", async () => {
    const covered: BlendedResponse = {
      ...mockBlendedResponse,
      carriers: mockBlendedResponse.carriers.map((c) => ({ ...c, margin_per_parcel: 2.5, loss_share: 0.1, parcels_at_loss: 30 })),
    };
    const { client } = spyClient({ blended: () => covered });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    expect(await screen.findByTestId("q3-verdict")).toHaveTextContent("Yes. $2.50 margin per parcel with USPS");
    expect(screen.getByTestId("q3-loss-share")).toHaveTextContent("10% of parcels (30 of 300)");
  });

  it("re-queries with the segment when a chip is pressed, and drops it on All", async () => {
    const { client, blended } = spyClient({
      blended: (b) => (b.segment ? { ...mockBlendedResponse, parcels_considered: 22 } : mockBlendedResponse),
    });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    await screen.findByTestId("q3-answer");
    const weight = screen.getByRole("group", { name: "Weight" });
    await userEvent.click(within(weight).getByRole("button", { name: "1–5 lb" }));
    await waitFor(() => expect(blended.mock.lastCall![0].segment).toEqual({ weight_band: "1–5" }));
    expect(within(weight).getByRole("button", { name: "1–5 lb" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(screen.getByRole("group", { name: "Address" })).getByRole("button", { name: "Homes" }));
    await waitFor(() => expect(blended.mock.lastCall![0].segment).toEqual({ weight_band: "1–5", residential: true }));
    expect(await screen.findByText(/in\s+this segment/)).toHaveTextContent("22 of 300 parcels in this segment");
    expect(screen.getByText(/Cheapest single carrier/)).toHaveTextContent("22 of 300 parcels · 1–5 lb · homes");
    await userEvent.click(within(weight).getByRole("button", { name: "All" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Address" })).getByRole("button", { name: "All" }));
    await waitFor(() => expect(blended.mock.lastCall![0]).not.toHaveProperty("segment"));
  });

  it("says so when a segment holds no parcels", async () => {
    const empty: BlendedResponse = {
      ...mockBlendedResponse,
      parcels_considered: 0,
      carriers: mockBlendedResponse.carriers.map((c) => ({ ...c, parcels_shipped: 0 })),
    };
    const { client } = spyClient({ blended: () => empty });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    expect(await screen.findByText("No parcels")).toBeInTheDocument();
    expect(screen.queryByTestId("q3-verdict")).not.toBeInTheDocument();
  });

  it("notes parcels a carrier cannot ship", async () => {
    const gap: BlendedResponse = {
      ...mockBlendedResponse,
      carriers: mockBlendedResponse.carriers.map((c) =>
        c.carrier === "fedex" ? { ...c, parcels_unavailable: 12, parcels_shipped: 288 } : c,
      ),
    };
    const { client } = spyClient({ blended: () => gap });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    expect(await screen.findByText(/cannot ship\s+12 of these parcels/)).toHaveTextContent("covers the other 288");
  });

  it("offers the cost split as a table, with the surcharge share", async () => {
    const { client } = spyClient();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} />);
    await screen.findByTestId("q3-answer");
    const figure = screen.getByRole("figure", { name: /what each parcel costs, by part/i });
    expect(within(figure).getByText(/Add-ons weigh most on UPS: 34%/)).toBeInTheDocument();
    await userEvent.click(within(figure).getByRole("button", { name: "Show as table" }));
    const table = within(figure).getByRole("table");
    const ups = within(table).getByRole("row", { name: /^UPS/ });
    expect(ups).toHaveTextContent("$28.17");
    expect(ups).toHaveTextContent("$4.90"); // home delivery surcharge
    expect(ups).toHaveTextContent("$9.07"); // fuel
    expect(ups).toHaveTextContent("13%");
    expect(within(figure).getByRole("button", { name: "Show as chart" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("blended logic", () => {
  it("picks the cheapest carrier and the mix saving", () => {
    const a = blendedAnswer(mockBlendedResponse)!;
    expect(a.cheapest.carrier).toBe("usps");
    expect(a.others.map((c) => c.carrier)).toEqual(["ups", "fedex"]);
    expect(a.mixSavingPerParcel).toBe(1.11);
  });

  it("keeps the three biggest surcharge kinds and folds the rest", () => {
    const k = surchargeKinds(mockBlendedResponse);
    expect(k.shown).toEqual(["residential", "nonstandard_volume", "delivery_area"]);
    expect(k.folded).toEqual(expect.arrayContaining(["additional_handling_packaging", "nonstandard_length", "delivery_area_extended"]));
    const usps = splitRows(mockBlendedResponse, k, CARRIER_NAME).find((r) => r.carrier === "usps")!;
    expect(usps.kinds.nonstandard_volume).toBe(1.87);
    expect(usps.kinds[OTHER_KIND]).toBe(0.14);
  });

  it("sends no segment when every group is All", () => {
    expect(cleanSegment({ weight_band: null, residential: null })).toBeNull();
    expect(cleanSegment({ residential: false })).toEqual({ residential: false });
  });
});
