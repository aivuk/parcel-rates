import { useEffect, useReducer, useRef } from "react";
import {
  FALLBACK_CONTROLS,
  readState,
  reducer,
  writeState,
  type Action,
  type AppState,
  type ControlsState,
} from "../state/urlState";

/** App state mirrored to the query string with history.replaceState, so any view is a shareable link. */
export function useUrlState(defaults: ControlsState | null): [AppState, (a: Action) => void] {
  const effectiveDefaults = defaults ?? FALLBACK_CONTROLS;
  const [state, dispatch] = useReducer(reducer, undefined, () => readState(window.location.search));
  const adopted = useRef(false);

  // Once the backend's defaults arrive, re-read the URL against them (fills in anything the link left out).
  useEffect(() => {
    if (!defaults || adopted.current) return;
    adopted.current = true;
    dispatch({ type: "replace", state: readState(window.location.search, defaults) });
  }, [defaults]);

  useEffect(() => {
    const search = writeState(state, window.location.search, effectiveDefaults);
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [state, effectiveDefaults]);

  useEffect(() => {
    const onPop = () => dispatch({ type: "replace", state: readState(window.location.search, effectiveDefaults) });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [effectiveDefaults]);

  return [state, dispatch];
}
