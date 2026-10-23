import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebounced } from "./useDebounced";

afterEach(() => vi.useRealTimers());

describe("useDebounced", () => {
  it("settles on the last value once it stops changing for the delay", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 250), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => vi.advanceTimersByTime(200));
    rerender({ v: 3 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe(3);
  });

  it("passes the value straight through with no delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 0), { initialProps: { v: "a" } });
    rerender({ v: "b" });
    expect(result.current).toBe("b");
  });
});
