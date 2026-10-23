import { describe, expect, it, vi } from "vitest";
import { ApiError, createHttpClient, describeLoc, problemsFromBody } from "./client";
import { mockDefaultControls, mockMeta, mockQuote422Body, mockQuoteResponse } from "./mocks";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("API client", () => {
  it("GETs /api/meta and returns the checked body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, mockMeta));
    const api = createHttpClient({ fetchImpl });
    await expect(api.meta()).resolves.toEqual(mockMeta);
    expect(fetchImpl).toHaveBeenCalledWith("/api/meta", expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("POSTs JSON to /api/quote", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, mockQuoteResponse));
    const api = createHttpClient({ fetchImpl });
    const parcel = { weight_lb: 2, distance_miles: 300, residential: true, speed: "ground" as const };
    await api.quote({ parcel, controls: mockDefaultControls });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/quote");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ parcel, controls: mockDefaultControls });
  });

  it("turns the backend's recorded 422 into an ApiError with readable field problems", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(422, mockQuote422Body));
    const api = createHttpClient({ fetchImpl });
    const parcel = { weight_lb: 80, distance_miles: 700, residential: true, speed: "ground" as const };
    const err = await api.quote({ parcel, controls: mockDefaultControls }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.message).toBe("Some inputs were not accepted.");
    expect(apiErr.problems).toEqual([
      { field: "parcel · weight_lb", message: "weight_lb must be at most 70" },
      { field: "parcel · speed", message: "speed must be one of 'ground', 'two_three_day' or 'next_day'" },
    ]);
  });

  it("numbers rows in parcel lists from 1", () => {
    expect(describeLoc(["body", "parcels", 3, "weight_lb"])).toBe("parcels · row 4 · weight_lb");
  });

  it("accepts a string detail (FastAPI HTTPException) and ignores junk", () => {
    expect(problemsFromBody({ detail: "Year 2019 is not covered" })).toEqual([{ field: "", message: "Year 2019 is not covered" }]);
    expect(problemsFromBody({ detail: [{ nope: 1 }] })).toEqual([]);
    expect(problemsFromBody("<html>")).toEqual([]);
    expect(describeLoc(["query", "year"])).toBe("year");
  });

  it("rejects a live answer that drifted from the contract, naming the endpoint and the field", async () => {
    const drifted = structuredClone(mockQuoteResponse) as unknown as { quotes: Record<string, unknown>[] };
    const first = drifted.quotes[0]!;
    first.price = first.total; // renamed field: total -> price
    delete first.total;
    const api = createHttpClient({ fetchImpl: vi.fn().mockResolvedValue(json(200, drifted)) });
    const parcel = { weight_lb: 2, distance_miles: 300, residential: true, speed: "ground" as const };
    const err = (await api.quote({ parcel, controls: mockDefaultControls }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(200);
    expect(err.contract).toMatchObject({ endpoint: "POST /api/quote", path: ".quotes[0].price" });
    expect(err.message).toContain("POST /api/quote");
    expect(err.message).toContain(".quotes[0].price");
  });

  it("rejects a GET answer missing a field", async () => {
    const { limitations: _gone, ...rest } = mockMeta;
    const api = createHttpClient({ fetchImpl: vi.fn().mockResolvedValue(json(200, rest)) });
    await expect(api.meta()).rejects.toMatchObject({ contract: { endpoint: "GET /api/meta", path: ".limitations" } });
  });

  it("reports a 500 with a non-JSON body and a network failure", async () => {
    const api500 = createHttpClient({ fetchImpl: vi.fn().mockResolvedValue(new Response("boom", { status: 500 })) });
    await expect(api500.sampleParcels()).rejects.toMatchObject({ status: 500, problems: [] });
    const apiDown = createHttpClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await expect(apiDown.meta()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("backend") });
  });
});
