/** Test helpers for the Q3/Q4 views: a mock client with spies, the sample parcels, a ResizeObserver stub. */
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ReactElement } from "react";
import { ApiProvider } from "../../api/ApiContext";
import { createMockClient, type ApiClient } from "../../api/client";
import { mockBlendedResponse, mockDefaultControls, mockMeta, mockSampleParcels, mockYearlyResponse } from "../../api/mocks";
import { fromParcelOut } from "../../lib/parcels";
import type { BlendedRequest, BlendedResponse, YearlyRequest, YearlyResponse } from "../../api/types";

export const sampleParcels = mockSampleParcels.parcels.map(fromParcelOut);
export const controls = mockDefaultControls;
export const meta = mockMeta;

export function stubResizeObserver() {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
}

export function spyClient(overrides: {
  blended?: (b: BlendedRequest) => BlendedResponse;
  yearly?: (b: YearlyRequest) => YearlyResponse;
} = {}) {
  const base = createMockClient(0);
  const blended = vi.fn(async (b: BlendedRequest) => (overrides.blended ?? (() => mockBlendedResponse))(b));
  const yearly = vi.fn(async (b: YearlyRequest) => (overrides.yearly ?? (() => mockYearlyResponse))(b));
  const client: ApiClient = { ...base, blended, yearly };
  return { client, blended, yearly };
}

export function renderWith(client: ApiClient, ui: ReactElement) {
  return render(<ApiProvider client={client}>{ui}</ApiProvider>);
}
