import { useEffect, useState } from "react";

/** The value after it has stopped changing for `delayMs`; a delay of 0 or less passes it straight through. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setSettled(value);
      return;
    }
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : settled;
}
