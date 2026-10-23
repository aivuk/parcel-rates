import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiProvider } from "../api/ApiContext";
import { createMockClient, type ApiClient } from "../api/client";
import { mockSampleParcels } from "../api/mocks";
import type { SampleParcels } from "../api/types";
import { useParcelSet } from "./useParcelSet";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(sampleCalls: Promise<SampleParcels>[]) {
  const client: ApiClient = { ...createMockClient(0), sampleParcels: () => sampleCalls.shift()! };
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider client={client}>{children}</ApiProvider>;
  return renderHook(() => useParcelSet(), { wrapper });
}

const csv = (rows: string) => new File([`weight_lb,distance_miles,residential,speed\n${rows}`], "mine.csv", { type: "text/csv" });

describe("useParcelSet: only the latest load commits", () => {
  it("a slow sample request does not overwrite a file uploaded meanwhile", async () => {
    const slow = deferred<SampleParcels>();
    const { result } = setup([slow.promise]);
    let samplePromise!: Promise<void>;
    act(() => {
      samplePromise = result.current.loadSample();
    });
    await act(() => result.current.loadFile(csv("2,100,true,ground\n")));
    expect(result.current.set?.name).toBe("mine.csv");
    await act(async () => {
      slow.resolve(mockSampleParcels);
      await samplePromise;
    });
    expect(result.current.set?.name).toBe("mine.csv");
    expect(result.current.status).toEqual({ kind: "idle" });
  });

  it("an older sample request resolving last loses to the newer one", async () => {
    const first = deferred<SampleParcels>();
    const second = deferred<SampleParcels>();
    const { result } = setup([first.promise, second.promise]);
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.loadSample();
      p2 = result.current.loadSample();
    });
    await act(async () => {
      second.resolve({ ...mockSampleParcels, description: "newer" });
      await p2;
    });
    await act(async () => {
      first.resolve({ ...mockSampleParcels, description: "older" });
      await p1;
    });
    expect(result.current.set?.description).toBe("newer");
  });

  it("a failed request that was superseded does not show its error", async () => {
    const failing = deferred<SampleParcels>();
    const { result } = setup([failing.promise]);
    let p!: Promise<void>;
    act(() => {
      p = result.current.loadSample();
    });
    act(() => result.current.clear());
    await act(async () => {
      failing.reject(new Error("boom"));
      await p;
    });
    expect(result.current.status).toEqual({ kind: "idle" });
    expect(result.current.set).toBeNull();
  });

  it("clear cancels a pending load", async () => {
    const slow = deferred<SampleParcels>();
    const { result } = setup([slow.promise]);
    let p!: Promise<void>;
    act(() => {
      p = result.current.loadSample();
    });
    act(() => result.current.clear());
    await act(async () => {
      slow.resolve(mockSampleParcels);
      await p;
    });
    await waitFor(() => expect(result.current.set).toBeNull());
  });
});
