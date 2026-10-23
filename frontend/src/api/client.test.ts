import { describe, expect, it, vi } from "vitest";
import { ApiError, createHttpClient, describeLoc, problemsFromBody } from "./client";
import { mockDefaultControls } from "./mocks";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("API client", () => {
  it("GETs /api/meta and returns the parsed body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { years: {} }));
    const api = createHttpClient({ fetchImpl });
    await expect(api.meta()).resolves.toEqual({ years: {} });
    expect(fetchImpl).toHaveBeenCalledWith("/api/meta", expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("POSTs JSON to /api/quote", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { quotes: [], cheapest_by_tier: {} }));
    const api = createHttpClient({ fetchImpl });
    const parcel = { weight_lb: 2, distance_miles: 300, residential: true, speed: "ground" as const };
    await api.quote({ parcel, controls: mockDefaultControls });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/quote");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ parcel, controls: mockDefaultControls });
  });

  it("turns a 422 into an ApiError with readable field problems", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(422, {
        detail: [
          { loc: ["body", "parcels", 3, "weight_lb"], msg: "weight_lb must be at most 70", type: "value_error" },
          { loc: ["body", "controls", "flat_price"], msg: "flat_price must be at least 0" },
        ],
      }),
    );
    const api = createHttpClient({ fetchImpl });
    const err = await api.blended({ parcels: [], controls: mockDefaultControls }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.message).toBe("Some inputs were not accepted.");
    expect(apiErr.problems).toEqual([
      { field: "parcels · row 4 · weight_lb", message: "weight_lb must be at most 70" },
      { field: "controls · flat_price", message: "flat_price must be at least 0" },
    ]);
  });

  it("accepts a string detail (FastAPI HTTPException) and ignores junk", () => {
    expect(problemsFromBody({ detail: "Year 2019 is not covered" })).toEqual([{ field: "", message: "Year 2019 is not covered" }]);
    expect(problemsFromBody({ detail: [{ nope: 1 }] })).toEqual([]);
    expect(problemsFromBody("<html>")).toEqual([]);
    expect(describeLoc(["query", "year"])).toBe("year");
  });

  it("reports a 500 with a non-JSON body and a network failure", async () => {
    const api500 = createHttpClient({ fetchImpl: vi.fn().mockResolvedValue(new Response("boom", { status: 500 })) });
    await expect(api500.sampleParcels()).rejects.toMatchObject({ status: 500, problems: [] });
    const apiDown = createHttpClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await expect(apiDown.meta()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("backend") });
  });
});
