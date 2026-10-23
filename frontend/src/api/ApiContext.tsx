import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, createClient, type ApiClient } from "./client";

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  const [value] = useState<ApiClient>(() => client ?? createClient());
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const c = useContext(ApiContext);
  if (!c) throw new Error("useApi must be used inside <ApiProvider>");
  return c;
}

export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: ApiError | Error };

/** Run `load` whenever `deps` change; aborts the previous request. */
export function useLoad<T>(load: ((signal: AbortSignal) => Promise<T>) | null, deps: readonly unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: load ? "loading" : "idle" });
  useEffect(() => {
    if (!load) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    load(ctrl.signal).then(
      (data) => !ctrl.signal.aborted && setState({ status: "ok", data }),
      (error: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
