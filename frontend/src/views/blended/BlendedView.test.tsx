import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlendedView } from "../BlendedView";
import { BlendedPanel } from "./BlendedPanel";
import { mockBlendedResponse } from "../../api/mocks";
import { cleanSegment, surchargeKinds, blendedAnswer, OTHER_KIND, splitRows } from "./logic";
import type { BlendedResponse } from "../../api/types";
import { controls, meta, renderWith, sampleParcels, spyClient, stubResizeObserver } from "./testUtils";
import { CARRIER_NAME } from "../../lib/carriers";
import { parcelActions } from "../../test/parcelActions";

beforeEach(() => stubResizeObserver());

describe("BlendedView", () => {
  it("asks for parcels with sample and upload actions when none are loaded", async () => {
    const { client, blended } = spyClient();
    const onLoadSample = vi.fn();
    const onUploadCsv = vi.fn();
    renderWith(client, <BlendedPanel controls={controls} meta={meta} parcels={null} {...parcelActions} onLoadSample={onLoadSample} onUploadCsv={onUploadCsv} />);
    await userEvent.click(screen.getByRole("button", { name: "Load the sample mix" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload CSV" }));
    expect(onLoadSample).toHaveBeenCalledOnce();
    expect(onUploadCsv).toHaveBeenCalledOnce();
    expect(blended).not.toHaveBeenCalled();
  });

  it("passes the view's parcel-set handlers to the empty-state buttons", async () => {
    const { client } = spyClient();
    const onLoadSample = vi.fn();
    const onUploadCsv = vi.fn();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={null} onLoadSample={onLoadSample} onUploadCsv={onUploadCsv} />);
    await userEvent.click(screen.getByRole("button", { name: "Load the sample mix" }));
    expect(onLoadSample).toHaveBeenCalledOnce();
    expect(onUploadCsv).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Upload CSV" }));
    expect(onUploadCsv).toHaveBeenCalledOnce();
  });

  it("puts the cheapest carrier's cost per parcel first, and says when the best mix saves nothing", async () => {
    const { client, blended } = spyClient();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByTestId("q3-answer")).toHaveTextContent(/^USPS \$10\.98 per parcel$/);
    expect(screen.getByText(/Blended over every parcel/)).toHaveTextContent("UPS $31.14 (+$20.16), FedEx $31.22 (+$20.24).");
    expect(blended).toHaveBeenCalledWith(expect.objectContaining({ parcels: sampleParcels, controls }), expect.anything());
    expect(blended.mock.calls[0]![0]).not.toHaveProperty("segment");
    const mix = screen.getByTestId("q3-mix");
    expect(mix).toHaveTextContent("$10.98");
    expect(mix).toHaveTextContent("no saving over USPS alone.");
    expect(mix).not.toHaveTextContent("less per parcel");
    expect(mix).toHaveTextContent(/^.*USPS 307$/);
  });

  it("shows the best mix saving when choosing per parcel is cheaper", async () => {
    const mixed: BlendedResponse = {
      ...mockBlendedResponse,
      best_mix: {
        ...mockBlendedResponse.best_mix,
        cost_per_parcel: 9.87,
        total_cost: 3030.09,
        parcels_by_carrier: { usps: 280, fedex: 17, ups: 10 },
      },
    };
    const { client } = spyClient({ blended: () => mixed });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    const mix = await screen.findByTestId("q3-mix");
    expect(mix).toHaveTextContent("$9.87");
    expect(mix).toHaveTextContent("$1.11 less per parcel than USPS alone ($341.27 on these parcels)");
    expect(mix).toHaveTextContent("USPS 280 · FedEx 17 · UPS 10");
  });

  it("says plainly whether the flat price covers the cost and how many parcels lose money", async () => {
    const { client } = spyClient();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByTestId("q3-verdict")).toHaveTextContent("No. You lose $0.31 per parcel with USPS");
    expect(screen.getByTestId("q3-loss-share")).toHaveTextContent("40% of parcels (124 of 307) ship at a loss");
    expect(screen.getByTestId("q3-loss-share")).not.toHaveTextContent("with the best mix");
    expect(screen.getByRole("heading", { name: /does your \$9\.99 shipping price cover the cost/i })).toBeInTheDocument();
    const ups = screen.getByTestId("margin-ups");
    expect(ups).toHaveTextContent("−$20.46 loss");
    expect(ups).toHaveTextContent("100%");
    expect(within(ups).getByText("−$20.46 loss")).toHaveClass("is-loss");
    expect(screen.getByText(/You charge \$10\.67 per parcel on average/)).toBeInTheDocument();
  });

  it("says how many parcels ship free under the free-shipping rule", async () => {
    const free: BlendedResponse = { ...mockBlendedResponse, free_shipping: { threshold: 75, parcels: 54 } };
    const { client, blended } = spyClient({ blended: () => free });
    const withRule = { ...controls, free_shipping_over: 75 };
    renderWith(client, <BlendedView controls={withRule} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByTestId("q3-free")).toHaveTextContent("54 of 307 parcels ship free: orders of $75 or more");
    expect(screen.getByText(/and \$0 on free-shipping orders/)).toBeInTheDocument();
    expect(blended.mock.calls[0]![0].controls).toMatchObject({ free_shipping_over: 75 });
  });

  it("says when no parcel has an order value for the free-shipping rule", async () => {
    const free: BlendedResponse = { ...mockBlendedResponse, free_shipping: { threshold: 75, parcels: 0 } };
    const { client } = spyClient({ blended: () => free });
    const noValues = sampleParcels.map(({ order_value: _v, ...p }) => p);
    renderWith(client, <BlendedView controls={{ ...controls, free_shipping_over: 75 }} meta={meta} parcels={noValues} {...parcelActions} />);
    expect(await screen.findByTestId("q3-free")).toHaveTextContent("no order_value column");
  });

  it("shows a margin, not a loss, when the price covers the cost", async () => {
    const covered: BlendedResponse = {
      ...mockBlendedResponse,
      carriers: mockBlendedResponse.carriers.map((c) => ({ ...c, margin_per_parcel: 2.5, loss_share: 0.1, parcels_at_loss: 30 })),
    };
    const { client } = spyClient({ blended: () => covered });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByTestId("q3-verdict")).toHaveTextContent("Yes. $2.50 margin per parcel with USPS");
    expect(screen.getByTestId("q3-loss-share")).toHaveTextContent("10% of parcels (30 of 307)");
  });

  it("says every parcel covers its cost when none ship at a loss", async () => {
    const none: BlendedResponse = {
      ...mockBlendedResponse,
      carriers: mockBlendedResponse.carriers.map((c) => ({ ...c, margin_per_parcel: 3, loss_share: 0, parcels_at_loss: 0 })),
      best_mix: { ...mockBlendedResponse.best_mix, margin_per_parcel: 4, loss_share: 0, parcels_at_loss: 0 },
    };
    const { client } = spyClient({ blended: () => none });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByTestId("q3-loss-share")).toHaveTextContent(/^Every parcel covers its cost with USPS\.$/);
    expect(screen.getByTestId("q3-loss-share")).not.toHaveTextContent("ship at a loss");
  });

  it("re-queries with the segment when a chip is pressed, and drops it on All", async () => {
    const { client, blended } = spyClient({
      blended: (b) => (b.segment ? { ...mockBlendedResponse, parcels_considered: 22 } : mockBlendedResponse),
    });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    await screen.findByTestId("q3-answer");
    const weight = screen.getByRole("group", { name: "Weight" });
    await userEvent.click(within(weight).getByRole("button", { name: "1–5 lb" }));
    await waitFor(() => expect(blended.mock.lastCall![0].segment).toEqual({ weight_band: "1–5" }));
    expect(within(weight).getByRole("button", { name: "1–5 lb" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(screen.getByRole("group", { name: "Address" })).getByRole("button", { name: "Homes" }));
    await waitFor(() => expect(blended.mock.lastCall![0].segment).toEqual({ weight_band: "1–5", residential: true }));
    expect(await screen.findByText(/in\s+this segment/)).toHaveTextContent("22 of 307 parcels in this segment");
    expect(screen.getByText(/Cheapest single carrier/)).toHaveTextContent("22 of 307 parcels · 1–5 lb · homes");
    expect(screen.getByTestId("q3-segment-result")).toHaveTextContent("cheapest USPS $10.98, −$0.31 loss per parcel");
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
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByText("No parcels")).toBeInTheDocument();
    expect(screen.queryByTestId("q3-verdict")).not.toBeInTheDocument();
  });

  it("notes parcels a carrier cannot ship", async () => {
    const gap: BlendedResponse = {
      ...mockBlendedResponse,
      carriers: mockBlendedResponse.carriers.map((c) =>
        c.carrier === "fedex" ? { ...c, parcels_unavailable: 12, parcels_shipped: 295 } : c,
      ),
    };
    const { client } = spyClient({ blended: () => gap });
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    expect(await screen.findByText(/cannot ship\s+12 of these parcels/)).toHaveTextContent("covers the other 295");
  });

  it("offers the cost split as a table, with the surcharge share", async () => {
    const { client } = spyClient();
    renderWith(client, <BlendedView controls={controls} meta={meta} parcels={sampleParcels} {...parcelActions} />);
    await screen.findByTestId("q3-answer");
    const figure = screen.getByRole("figure", { name: /what each parcel costs, by part/i });
    expect(within(figure).getByText(/Add-ons weigh most on UPS: 39%/)).toBeInTheDocument();
    await userEvent.click(within(figure).getByRole("button", { name: "Show as table" }));
    const table = within(figure).getByRole("table");
    const ups = within(table).getByRole("row", { name: /^UPS/ });
    expect(ups).toHaveTextContent("$19.01"); // base
    expect(ups).toHaveTextContent("$5.25"); // home delivery surcharge
    expect(ups).toHaveTextContent("$6.53"); // fuel
    expect(ups).toHaveTextContent("$31.14");
    expect(ups).toHaveTextContent("18%");
    expect(within(figure).getByRole("button", { name: "Show as chart" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("blended logic", () => {
  it("picks the cheapest carrier and the mix saving", () => {
    const a = blendedAnswer(mockBlendedResponse)!;
    expect(a.cheapest.carrier).toBe("usps");
    expect(a.others.map((c) => c.carrier)).toEqual(["ups", "fedex"]);
    expect(a.mixSavingPerParcel).toBe(0);
    expect(a.mixSavingTotal).toBe(0);
  });

  it("shows up to four surcharge kinds without folding", () => {
    const k = surchargeKinds(mockBlendedResponse);
    expect(k.shown).toEqual(["residential", "additional_handling_packaging", "delivery_area", "delivery_area_extended"]);
    expect(k.folded).toEqual([]);
    const ups = splitRows(mockBlendedResponse, k, CARRIER_NAME).find((r) => r.carrier === "ups")!;
    expect(ups.kinds.residential).toBe(5.25);
    expect(ups.kinds).not.toHaveProperty(OTHER_KIND);
  });

  it("keeps the three biggest surcharge kinds and folds the rest", () => {
    const extra = { condition: "nonstandard_length", total: 4.5, per_parcel: 0.01, share_of_cost: 0.0013 };
    const r: BlendedResponse = {
      ...mockBlendedResponse,
      carriers: mockBlendedResponse.carriers.map((c) =>
        c.carrier === "usps" ? { ...c, surcharges_by_condition: [...c.surcharges_by_condition, extra] } : c,
      ),
    };
    const k = surchargeKinds(r);
    expect(k.shown).toEqual(["residential", "additional_handling_packaging", "delivery_area"]);
    expect(k.folded).toEqual(expect.arrayContaining(["nonstandard_length", "delivery_area_extended"]));
    const usps = splitRows(r, k, CARRIER_NAME).find((rw) => rw.carrier === "usps")!;
    expect(usps.kinds.additional_handling_packaging).toBe(0.03);
    expect(usps.kinds[OTHER_KIND]).toBe(0.01);
    const ups = splitRows(r, k, CARRIER_NAME).find((rw) => rw.carrier === "ups")!;
    expect(ups.kinds[OTHER_KIND]).toBe(0.03);
  });

  it("sends no segment when every group is All", () => {
    expect(cleanSegment({ weight_band: null, residential: null })).toBeNull();
    expect(cleanSegment({ residential: false })).toEqual({ residential: false });
  });
});
