import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "../../api/ApiContext";
import { ApiError, createMockClient, problemsFromBody, type ApiClient } from "../../api/client";
import { asQuoteResponse } from "../../api/guards";
import { mockDefaultControls, mockMeta, mockQuote422Body, mockQuoteResponse } from "../../api/mocks";
import quote2027Fx from "../../api/__fixtures__/quote-2027.json";
import type { QuoteResponse } from "../../api/types";
import type { ControlsState } from "../../state/urlState";
import { QuoteView } from "../QuoteView";
import { DEFAULT_DRAFT, draftToParcel, draftFromParcel, parseNum } from "./draft";

// The recorded fixture's parcel: 3.2 lb, 14×12×10 in, 700 mi, home, ground, remote area.
const FIXTURE_DRAFT = { ...DEFAULT_DRAFT, lb: "3.2", length: "14", width: "12", height: "10", distance: "700", area: "das" as const };

function setup(client: Partial<ApiClient> = {}, controls: ControlsState = mockDefaultControls) {
  const quote = vi.fn(client.quote ?? (async () => mockQuoteResponse));
  const api: ApiClient = { ...createMockClient(0), ...client, quote };
  const utils = render(
    <ApiProvider client={api}>
      <QuoteView controls={controls} meta={mockMeta} parcels={null} debounceMs={0} initialDraft={FIXTURE_DRAFT} />
    </ApiProvider>,
  );
  return { ...utils, quote, api };
}

describe("QuoteView", () => {
  it("puts the cheapest service first, as the largest figure, with its margin", async () => {
    setup();
    expect(await screen.findByTestId("quote-answer")).toHaveTextContent("$11.89");
    expect(screen.getByTestId("quote-answer")).toHaveClass("answer__figure");
    expect(screen.getByText(/−\$1\.90 loss/)).toHaveClass("is-loss");
    expect(screen.getByText(/against your \$9\.99 price/)).toBeInTheDocument();
  });

  it("sends the parcel with the global controls and re-prices when they change", async () => {
    const { quote, rerender, api } = setup();
    await screen.findByTestId("quote-answer");
    expect(quote).toHaveBeenLastCalledWith(
      {
        parcel: {
          weight_lb: 3.2,
          length_in: 14,
          width_in: 12,
          height_in: 10,
          distance_miles: 700,
          residential: true,
          speed: "ground",
          delivery_area: "das",
          nonstandard_packaging: false,
        },
        controls: mockDefaultControls,
      },
      expect.anything(),
    );
    const next = { ...mockDefaultControls, peak: true, flat_price: 12, fuel_override_percent: { ground: 30 } };
    rerender(
      <ApiProvider client={api}>
        <QuoteView controls={next} meta={mockMeta} parcels={null} debounceMs={0} initialDraft={FIXTURE_DRAFT} />
      </ApiProvider>,
    );
    await waitFor(() => expect(quote).toHaveBeenLastCalledWith(expect.objectContaining({ controls: next }), expect.anything()));
  });

  it("ranks every carrier's cheapest ground service and expands a row into cited line items", async () => {
    setup();
    await screen.findByTestId("quote-answer");
    const rows = screen.getAllByRole("button", { expanded: false }).filter((b) => b.classList.contains("qr__head"));
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/USPS.*Ground Advantage.*\$11\.89.*cheapest/),
      expect.stringMatching(/UPS.*Ground.*\$43\.47.*\+\$31\.58/),
      expect.stringMatching(/FedEx.*Home Delivery.*\$43\.86/),
    ]);
    await userEvent.click(rows[1]!);
    expect(rows[1]).toHaveAttribute("aria-expanded", "true");
    const table = screen.getByRole("table", { name: /line items of UPS Ground/i });
    const items = within(table).getAllByRole("row");
    expect(items.map((r) => r.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Residential Surcharge.*p\.185.*\$6\.50/),
        expect.stringMatching(/Delivery Area Surcharge.*p\.182.*\$6\.55/),
        expect.stringMatching(/Fuel Surcharge \(26\.25%\).*\$9\.04/),
      ]),
    );
    expect(within(table).getByText(/base \$21\.38 · surcharges \$13\.05 · fuel \$9\.04/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Base $21.38, surcharges $13.05, fuel $9.04" })).toBeInTheDocument();
  });

  it("lists services that cannot carry the parcel with their reason", async () => {
    setup();
    await screen.findByTestId("quote-answer");
    const list = screen.getByRole("list", { name: "Services that cannot carry this parcel" });
    expect(list).toHaveTextContent("FedEx Ground");
    expect(list).toHaveTextContent("Not available: FedEx Ground serves business addresses only");
  });

  it("explains dimensional weight when the box size sets the billable weight", async () => {
    setup();
    const note = await screen.findByRole("region", { name: "Billed by size, not weight" });
    expect(note).toHaveTextContent("this 3.2 lb box is billed as up to 13 lb");
    expect(within(note).getByRole("row", { name: /UPS Ground 3\.2 lb 13 lb 13 lb/ })).toBeInTheDocument();
  });

  it("shows the zone per carrier under the distance and the other speeds in one line each", async () => {
    setup();
    await screen.findByTestId("quote-answer");
    expect(screen.getByText("Zone 5 for every carrier")).toBeInTheDocument();
    const tiers = screen.getByRole("region", { name: /other speeds/i });
    expect(tiers).toHaveTextContent(/2–3 day\s*USPS Priority Mail\s*\$18\.41/);
    expect(tiers).toHaveTextContent(/Next day\s*USPS Priority Mail Express\s*\$61\.05/);
  });

  it("switches the speed from the other-speeds line", async () => {
    const { quote } = setup();
    await screen.findByTestId("quote-answer");
    await userEvent.click(screen.getByRole("button", { name: "Quote next day" }));
    expect(screen.getByRole("radio", { name: "Next day" })).toBeChecked();
    await waitFor(() => expect(quote).toHaveBeenLastCalledWith(expect.objectContaining({ parcel: expect.objectContaining({ speed: "next_day" }) }), expect.anything()));
    expect(await screen.findByTestId("quote-answer")).toHaveTextContent("$61.05");
  });

  it("puts the server's 422 messages next to the inputs they concern", async () => {
    const problems = problemsFromBody(mockQuote422Body);
    setup({ quote: async () => Promise.reject(new ApiError(422, "Some inputs were not accepted.", problems)) });
    const weight = screen.getByRole("group", { name: "Weight" });
    expect(await within(weight).findByText("weight_lb must be at most 70")).toBeInTheDocument();
    for (const label of ["Weight in pounds", "Plus ounces"]) {
      const input = within(weight).getByLabelText(label);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription("weight_lb must be at most 70");
    }
    expect(weight).not.toHaveAttribute("aria-invalid");
    expect(weight).not.toHaveAttribute("aria-describedby");
    for (const radio of within(screen.getByRole("group", { name: "Speed needed" })).getAllByRole("radio")) {
      expect(radio).toHaveAccessibleDescription(/speed must be one of/);
    }
    expect(within(screen.getByRole("group", { name: "Speed needed" })).getByText(/speed must be one of/)).toBeInTheDocument();
    expect(screen.getByText(/Fix the input marked/)).toBeInTheDocument();
  });

  it("catches an empty weight and half-given dimensions without calling the server", async () => {
    const { quote } = setup();
    await screen.findByTestId("quote-answer");
    quote.mockClear();
    fireEvent.change(screen.getByLabelText("Weight in pounds"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Height in inches"), { target: { value: "" } });
    expect(await screen.findByText("Enter the weight.")).toBeInTheDocument();
    for (const label of ["Length in inches", "Width in inches", "Height in inches"]) {
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription("Give all three dimensions, or leave all three empty.");
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    }
    expect(quote).not.toHaveBeenCalled();
  });

  it("shows a retryable error when the service fails", async () => {
    const fail = vi.fn(async () => Promise.reject(new ApiError(0, "Cannot reach the rate service. Is the backend running?")));
    setup({ quote: fail });
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the rate service");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fail).toHaveBeenCalledTimes(2));
  });

  it("shows a skeleton while the first quote loads", () => {
    setup({ quote: () => new Promise(() => {}) });
    expect(screen.getByTestId("quote-loading")).toBeInTheDocument();
  });

  it("says plainly that 2027 is FedEx only", async () => {
    const res2027 = asQuoteResponse(quote2027Fx.response.body);
    setup({ quote: async () => res2027 }, { ...mockDefaultControls, year: 2027 });
    expect(screen.getByRole("note")).toHaveTextContent("2027 prices are published by FedEx only");
    expect(await screen.findByTestId("quote-answer")).toHaveTextContent("$27.62");
  });

  it("prefills the form from a parcel of the loaded set", async () => {
    const api = { ...createMockClient(0), quote: vi.fn(async () => mockQuoteResponse) };
    render(
      <ApiProvider client={api}>
        <QuoteView
          controls={mockDefaultControls}
          meta={mockMeta}
          parcels={[{ weight_lb: 0.5, distance_miles: 120, residential: false, speed: "two_three_day" }]}
          debounceMs={0}
        />
      </ApiProvider>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Start from one of your parcels"), "0");
    expect(screen.getByLabelText("Plus ounces")).toHaveValue("8");
    expect(screen.getByLabelText("Distance")).toHaveValue("120");
    expect(screen.getByRole("radio", { name: "A business" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "2–3 day" })).toBeChecked();
  });
});

/** The fixture with the cheapest ground total replaced, to tell two answers apart. */
function withGroundTotal(total: number): QuoteResponse {
  const pick = mockQuoteResponse.cheapest_by_tier.ground!;
  return {
    ...mockQuoteResponse,
    quotes: mockQuoteResponse.quotes.map((q) => (q.service_id === pick.service_id && q.tier === "ground" ? { ...q, total } : q)),
    cheapest_by_tier: { ...mockQuoteResponse.cheapest_by_tier, ground: { ...pick, total } },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("QuoteView timing", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for typing to settle before asking for a quote", async () => {
    vi.useFakeTimers();
    const quote = vi.fn(async () => mockQuoteResponse);
    render(
      <ApiProvider client={{ ...createMockClient(0), quote }}>
        <QuoteView controls={mockDefaultControls} meta={mockMeta} parcels={null} debounceMs={300} initialDraft={FIXTURE_DRAFT} />
      </ApiProvider>,
    );
    expect(quote).toHaveBeenCalledTimes(1); // the first parcel is priced at once
    const lb = screen.getByLabelText("Weight in pounds");
    fireEvent.change(lb, { target: { value: "5" } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(lb, { target: { value: "52" } });
    act(() => vi.advanceTimersByTime(299));
    expect(quote).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(quote).toHaveBeenCalledTimes(2);
    expect(quote).toHaveBeenLastCalledWith(
      expect.objectContaining({ parcel: expect.objectContaining({ weight_lb: 52 }) }),
      expect.anything(),
    );
  });

  it("shows the answer of the latest request even when an older one resolves last", async () => {
    const first = deferred<QuoteResponse>();
    const second = deferred<QuoteResponse>();
    const quote = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(
      <ApiProvider client={{ ...createMockClient(0), quote }}>
        <QuoteView controls={mockDefaultControls} meta={mockMeta} parcels={null} debounceMs={0} initialDraft={FIXTURE_DRAFT} />
      </ApiProvider>,
    );
    fireEvent.change(screen.getByLabelText("Weight in pounds"), { target: { value: "4" } });
    await waitFor(() => expect(quote).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(withGroundTotal(22.22)));
    await act(async () => first.resolve(withGroundTotal(11.11)));
    expect(screen.getByTestId("quote-answer")).toHaveTextContent("$22.22");
  });

  it("dims the previous answer while the next one loads", async () => {
    const next = deferred<QuoteResponse>();
    const quote = vi.fn().mockResolvedValueOnce(withGroundTotal(11.11)).mockReturnValueOnce(next.promise);
    render(
      <ApiProvider client={{ ...createMockClient(0), quote }}>
        <QuoteView controls={mockDefaultControls} meta={mockMeta} parcels={null} debounceMs={0} initialDraft={FIXTURE_DRAFT} />
      </ApiProvider>,
    );
    const answer = await screen.findByTestId("quote-answer");
    expect(answer.closest(".is-stale")).toBeNull();
    fireEvent.change(screen.getByLabelText("Weight in pounds"), { target: { value: "4" } });
    await waitFor(() => expect(screen.getByTestId("quote-answer").closest(".is-stale")).not.toBeNull());
    expect(screen.getByTestId("quote-answer")).toHaveTextContent("$11.11");
    await act(async () => next.resolve(withGroundTotal(33.33)));
    expect(screen.getByTestId("quote-answer")).toHaveTextContent("$33.33");
    expect(screen.getByTestId("quote-answer").closest(".is-stale")).toBeNull();
  });
});

describe("draft", () => {
  it("adds ounces to pounds and leaves ranges to the server", () => {
    const r = draftToParcel({ ...DEFAULT_DRAFT, lb: "1", oz: "8", length: "", width: "", height: "", distance: "-5" });
    expect(r.parcel).toMatchObject({ weight_lb: 1.5, distance_miles: -5 });
    expect(r.parcel).not.toHaveProperty("length_in");
  });

  it("accepts a decimal comma", () => {
    const r = draftToParcel({ ...DEFAULT_DRAFT, lb: "1,5", oz: "", length: "10,5", width: "4", height: "2", distance: "600" });
    expect(r.parcel).toMatchObject({ weight_lb: 1.5, length_in: 10.5 });
    expect(parseNum("1,2,3")).toBeNaN();
  });

  it("round-trips a parcel with a fractional weight", () => {
    const d = draftFromParcel({ weight_lb: 3.25, distance_miles: 10, residential: true, speed: "ground" });
    expect([d.lb, d.oz]).toEqual(["3", "4"]);
    expect(draftToParcel(d).parcel?.weight_lb).toBe(3.25);
  });
});
