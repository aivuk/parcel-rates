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
  ValidationErrorBody,
  ValidationIssue,
  YearlyRequest,
  YearlyResponse,
} from "./types";

export const API_BASE = "/api";

/** A readable problem with one input field, for display to the shop owner. */
export interface FieldProblem {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problems: FieldProblem[];

  constructor(status: number, message: string, problems: FieldProblem[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
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
  const detail = (body as ValidationErrorBody).detail;
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

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    return body as T;
  }

  const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), signal });

  return {
    health: (signal) => request<HealthResponse>("/health", { signal }),
    meta: (signal) => request<Meta>("/meta", { signal }),
    sampleParcels: (signal) => request<SampleParcels>("/sample-parcels", { signal }),
    quote: (body, signal) => post<QuoteResponse>("/quote", body, signal),
    breakeven: (body, signal) => post<BreakevenResponse>("/breakeven", body, signal),
    blended: (body, signal) => post<BlendedResponse>("/blended", body, signal),
    yearly: (body, signal) => post<YearlyResponse>("/yearly", body, signal),
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
