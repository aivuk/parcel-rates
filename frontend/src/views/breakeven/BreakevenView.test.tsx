import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "../../api/ApiContext";
import { ApiError, createMockClient, type ApiClient } from "../../api/client";
import { asBreakevenResponse } from "../../api/guards";
import { mockBreakevenResponse, mockDefaultControls, mockMeta } from "../../api/mocks";
import be2027Fx from "../../api/__fixtures__/breakeven-2027.json";
import type { ControlsState } from "../../state/urlState";
import { BreakevenView } from "../BreakevenView";
import { savingLevel } from "./readout";

function setup(client: Partial<ApiClient> = {}, controls: ControlsState = mockDefaultControls) {
  const breakeven = vi.fn(client.breakeven ?? (async () => mockBreakevenResponse));
  const api: ApiClient = { ...createMockClient(0), ...client, breakeven };
  const utils = render(
    <ApiProvider client={api}>
      <BreakevenView controls={controls} meta={mockMeta} parcels={null} />
    </ApiProvider>,
  );
  return { ...utils, breakeven, api };
}

const cells = () => screen.getAllByRole("gridcell");

describe("BreakevenView", () => {
  it("leads with where USPS stops winning, then one plain line per distance", async () => {
    setup();
    const figure = await screen.findByTestId("breakeven-answer");
    expect(figure).toHaveTextContent("27 lb");
    expect(figure).toHaveClass("answer__figure");
    const lines = screen.getByRole("list", { name: "Breakeven by distance" });
    expect(lines).toHaveTextContent(
      "From 25 mi to 450 mi (zones 1–4), USPS Ground Advantage is cheapest at every weight up to 70 lb.",
    );
    expect(lines).toHaveTextContent(
      /From 800 mi to 1,200 mi \(zones 5–6\), USPS Ground Advantage is cheapest up to 26 lb and again from 51 lb; between 27 lb and 50 lb UPS Ground or FedEx Home Delivery mostly wins\./,
    );
  });

  it("draws one cell per weight and distance, and names carriers in the legend", async () => {
    setup();
    await screen.findByTestId("breakeven-answer");
    expect(cells()).toHaveLength(70 * 8);
    expect(screen.getAllByRole("row")).toHaveLength(70);
    const legend = screen.getByRole("group", { name: "Legend" });
    expect(legend).toHaveTextContent("USPS Ground Advantage cheapest");
    expect(legend).toHaveTextContent("UPS Ground cheapest");
    expect(legend).toHaveTextContent("FedEx Home Delivery cheapest");
    expect(cells()[0]).toHaveAttribute("data-carrier", "usps");
  });

  it("shows every carrier's total in the tooltip of a focused cell", async () => {
    setup();
    await screen.findByTestId("breakeven-answer");
    fireEvent.focus(cells()[0]!);
    const tip = screen.getByRole("status");
    expect(tip).toHaveTextContent("1 lb · 25 mi");
    expect(tip).toHaveTextContent(/USPS Ground Advantage\s*\$7\.05/);
    expect(tip).toHaveTextContent(/FedEx Home Delivery\s*\$23\.28/);
    expect(tip).toHaveTextContent(/UPS Ground\s*\$23\.34/);
    expect(tip).toHaveTextContent("USPS saves $16.23 over FedEx");
  });

  it("moves through the grid with the arrow keys using a roving tab stop", async () => {
    setup();
    await screen.findByTestId("breakeven-answer");
    const all = cells();
    expect(all.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    act(() => all[0]!.focus());
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("aria-label", expect.stringMatching(/^2 lb, 100 mi: /));
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toHaveAttribute("aria-label", expect.stringMatching(/^2 lb, 2,000 mi: /));
    await userEvent.keyboard("{PageDown}");
    expect(document.activeElement).toHaveAttribute("aria-label", expect.stringMatching(/^12 lb, 2,000 mi: /));
    expect(cells().filter((c) => c.tabIndex === 0)).toEqual([document.activeElement]);
    expect(screen.getByRole("status")).toHaveTextContent("12 lb · 2,000 mi");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the focus ring on the focused cell after Escape closes the tooltip", async () => {
    setup();
    await screen.findByTestId("breakeven-answer");
    act(() => cells()[0]!.focus());
    await userEvent.keyboard("{ArrowDown}");
    const ring = screen.getByTestId("heatmap-focus");
    const cell = document.activeElement as SVGRectElement;
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(cell);
    expect(screen.getByTestId("heatmap-focus")).toBe(ring);
    expect(ring).toHaveAttribute("y", cell.getAttribute("y"));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("status")).toHaveTextContent("2 lb · 100 mi");
  });

  it("offers the map as a table with every carrier's total per weight, one distance at a time", async () => {
    setup();
    await screen.findByTestId("breakeven-answer");
    await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show as map" })).toHaveAttribute("aria-expanded", "true");
    let table = screen.getByRole("table", { name: /ground prices at 25 mi \(zone 1 \(UPS\/FedEx 2\)\)/i });
    expect(within(table).getAllByRole("row")).toHaveLength(71);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Weight",
      "USPS Ground Advantage",
      "UPS Ground",
      "FedEx Home Delivery",
      "Cheapest",
      "Saving",
    ]);
    // The same facts as the tooltip of 1 lb at 25 mi.
    expect(within(table).getByRole("rowheader", { name: "1 lb" }).closest("tr")).toHaveTextContent(
      /1 lb\s*\$7\.05\s*\$23\.34\s*\$23\.28\s*USPS\s*\$16\.23 vs FedEx/,
    );
    await userEvent.selectOptions(screen.getByLabelText("Distance"), "4");
    table = screen.getByRole("table", { name: /ground prices at 800 mi \(zone 5\)/i });
    expect(within(table).getByRole("rowheader", { name: "31 lb" }).closest("tr")).toHaveTextContent(/FedEx/);
  });

  it("asks again for business delivery and when the global controls change", async () => {
    const { breakeven, rerender, api } = setup();
    await screen.findByTestId("breakeven-answer");
    expect(breakeven).toHaveBeenLastCalledWith({ controls: mockDefaultControls, residential: true }, expect.anything());
    await userEvent.click(screen.getByRole("radio", { name: "Businesses" }));
    await waitFor(() =>
      expect(breakeven).toHaveBeenLastCalledWith({ controls: mockDefaultControls, residential: false }, expect.anything()),
    );
    const next = { ...mockDefaultControls, year: 2024, peak: true };
    rerender(
      <ApiProvider client={api}>
        <BreakevenView controls={next} meta={mockMeta} parcels={null} />
      </ApiProvider>,
    );
    await waitFor(() => expect(breakeven).toHaveBeenLastCalledWith({ controls: next, residential: false }, expect.anything()));
  });

  it("says plainly that 2027 is FedEx only and draws no map", async () => {
    const res = asBreakevenResponse(be2027Fx.response.body);
    setup({ breakeven: async () => res }, { ...mockDefaultControls, year: 2027 });
    expect(await screen.findByTestId("breakeven-answer")).toHaveTextContent("FedEx only");
    expect(screen.getByRole("note")).toHaveTextContent("2027 prices are published by FedEx only");
    expect(screen.getByText(/USPS has no 2027 prices/)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton, then a retryable error", async () => {
    let fail = true;
    const breakeven = vi.fn(async () => {
      if (fail) throw new ApiError(500, "The rate service had a problem. Try again in a moment.");
      return mockBreakevenResponse;
    });
    setup({ breakeven });
    expect(screen.getByTestId("breakeven-loading")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("The rate service had a problem");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("breakeven-answer")).toHaveTextContent("27 lb");
  });
});

describe("readout", () => {
  it("buckets savings in fixed dollar steps", () => {
    expect([0, 0.99, 1, 2.99, 3, 9.99, 10, 60].map(savingLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});
