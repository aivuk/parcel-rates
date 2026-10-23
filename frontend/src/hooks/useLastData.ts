import { useEffect, useState } from "react";
import type { Loadable } from "../api/ApiContext";

/** The latest successful data, so controls re-query without blanking the view. */
export function useLastData<T>(state: Loadable<T>): T | null {
  const [last, setLast] = useState<T | null>(state.status === "ok" ? state.data : null);
  useEffect(() => {
    if (state.status === "ok") setLast(state.data);
  }, [state]);
  return state.status === "ok" ? state.data : last;
}
