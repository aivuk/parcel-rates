import type {
  BlendedRequest,
  BlendedResponse,
  BreakevenRequest,
  BreakevenResponse,
  HealthResponse,
  Meta,
  QuoteRequest,
  QuoteResponse,
  SampleParcels,
  HttpErrorBody,
  ValidationErrorBody,
  ValidationIssue,
  YearlyRequest,
  YearlyResponse,
} from "./types";

import {
  ContractError,
  asBlendedResponse,
  asBreakevenResponse,
  asHealth,
  asMeta,
  asQuoteResponse,
  asSampleParcels,
  asYearlyResponse,
} from "./guards";

export const API_BASE = "/api";

/** A readable problem with one input field, for display to the shop owner. */
export interface FieldProblem {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problems: FieldProblem[];
  /** Set when a 2xx answer did not match the contract (src/api/types.ts). */
  readonly contract?: { endpoint: string; path: string; detail: string };

  constructor(
    status: number,
    message: string,
    problems: FieldProblem[] = [],
    contract?: { endpoint: string; path: string; detail: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
    if (contract) this.contract = contract;
  }
}

/** Turn a Pydantic `loc` like ["body","parcels",3,"weight_lb"] into "parcels row 4 · weight_lb". */
export function describeLoc(loc: readonly (string | number)[]): string {
  const parts = loc[0] === "body" || loc[0] === "query" ? loc.slice(1) : loc;
  return parts
    .map((p) => (typeof p === "number" ? `row ${p + 1}` : p))
    .join(" · ");
}

function isIssue(x: unknown): x is ValidationIssue {
  return (
    typeof x === "object" &&
    x !== null &&
    Array.isArray((x as ValidationIssue).loc) &&
    typeof (x as ValidationIssue).msg === "string"
  );
}

export function problemsFromBody(body: unknown): FieldProblem[] {
  if (typeof body !== "object" || body === null || !("detail" in body)) return [];
  const detail = (body as ValidationErrorBody | HttpErrorBody).detail;
  if (typeof detail === "string") return [{ field: "", message: detail }];
  if (!Array.isArray(detail)) return [];
  return detail.filter(isIssue).map((d) => ({ field: describeLoc(d.loc), message: d.msg }));
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function statusMessage(status: number): string {
  if (status === 422) return "Some inputs were not accepted.";
  if (status === 404) return "The rate service does not know this request.";
  if (status >= 500) return "The rate service had a problem. Try again in a moment.";
  return `The rate service answered with status ${status}.`;
}

export interface ApiClient {
  health(signal?: AbortSignal): Promise<HealthResponse>;
  meta(signal?: AbortSignal): Promise<Meta>;
  sampleParcels(signal?: AbortSignal): Promise<SampleParcels>;
  quote(body: QuoteRequest, signal?: AbortSignal): Promise<QuoteResponse>;
  breakeven(body: BreakevenRequest, signal?: AbortSignal): Promise<BreakevenResponse>;
  blended(body: BlendedRequest, signal?: AbortSignal): Promise<BlendedResponse>;
  yearly(body: YearlyRequest, signal?: AbortSignal): Promise<YearlyResponse>;
}

export interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function createHttpClient({ baseUrl = API_BASE, fetchImpl }: ClientOptions = {}): ApiClient {
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  /** Fetch, map HTTP errors to ApiError, and check a 2xx body with the endpoint's guard. */
  async function request<T>(path: string, guard: (v: unknown) => T, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiError(0, "Cannot reach the rate service. Is the backend running?");
    }
    const body = await readJson(res);
    if (!res.ok) {
      const problems = problemsFromBody(body);
      throw new ApiError(res.status, statusMessage(res.status), problems);
    }
    if (body === null) throw new ApiError(res.status, "The rate service sent an empty answer.");
    try {
      return guard(body);
    } catch (err) {
      if (!(err instanceof ContractError)) throw err;
      const endpoint = `${init.method ?? "GET"} ${baseUrl}${path}`;
      const field = err.path || "(body)";
      throw new ApiError(
        res.status,
        `The rate service answered ${endpoint} in an unexpected shape (${field}: expected ${err.expected}). ` +
          "The frontend and backend versions probably differ.",
        [],
        { endpoint, path: field, detail: err.message },
      );
    }
  }

  const get = <T>(path: string, guard: (v: unknown) => T, signal?: AbortSignal) => request(path, guard, { signal });
  const post = <T>(path: string, guard: (v: unknown) => T, body: unknown, signal?: AbortSignal) =>
    request(path, guard, { method: "POST", body: JSON.stringify(body), signal });

  return {
    health: (signal) => get("/health", asHealth, signal),
    meta: (signal) => get("/meta", asMeta, signal),
    sampleParcels: (signal) => get("/sample-parcels", asSampleParcels, signal),
    quote: (body, signal) => post("/quote", asQuoteResponse, body, signal),
    breakeven: (body, signal) => post("/breakeven", asBreakevenResponse, body, signal),
    blended: (body, signal) => post("/blended", asBlendedResponse, body, signal),
    yearly: (body, signal) => post("/yearly", asYearlyResponse, body, signal),
  };
}

/** `?mock=1` serves typed mock responses; the mock module is a separate lazy chunk. */
export function isMockMode(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get("mock") === "1";
}

export function createMockClient(delayMs = 350): ApiClient {
  const load = () => import("./mocks");
  const wait = <T>(fn: () => T | Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        Promise.resolve().then(fn).then(resolve, reject);
      }, delayMs);
    });
  return {
    health: () => wait(() => ({ status: "ok" as const })),
    meta: () => wait(async () => (await load()).mockMeta),
    sampleParcels: () => wait(async () => (await load()).mockSampleParcels),
    quote: () => wait(async () => (await load()).mockQuote()),
    breakeven: () => wait(async () => (await load()).mockBreakeven()),
    blended: () => wait(async () => (await load()).mockBlended()),
    yearly: () => wait(async () => (await load()).mockYearly()),
  };
}

export function createClient(): ApiClient {
  return isMockMode() ? createMockClient() : createHttpClient();
}
