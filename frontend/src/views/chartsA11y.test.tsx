/**
 * The chart SVGs sit inside an aria-hidden wrapper (the text summary and table carry the
 * content), so nothing inside may take focus. Recharts 3 turns on its accessibility layer by
 * default (tabIndex=0, role="application" on the svg); the charts switch it off.
 * jsdom gives ResponsiveContainer no size, so it is replaced by a fixed-size pass-through.
 */
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { mockBlendedResponse, mockYearlyResponse } from "../api/mocks";
import { CostSplitChart } from "./blended/CostSplitChart";
import { YearChart } from "./yearly/YearChart";
import { DriverChart } from "./yearly/DriverChart";
import { pointNotes } from "./yearly/logic";
import { stubResizeObserver } from "./blended/testUtils";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children) ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 600, height: 300 }) : null,
  };
});

beforeEach(() => stubResizeObserver());

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function expectNoHiddenFocusStop(container: HTMLElement) {
  // The wrapper that holds the chart (other aria-hidden bits, like a chip's check mark, hold no svg).
  const hidden = [...container.querySelectorAll('[aria-hidden="true"]')].find((el) => el.querySelector("svg")) ?? null;
  expect(hidden).not.toBeNull();
  expect(hidden!.querySelector("svg")).not.toBeNull(); // the chart really rendered
  expect(hidden!.querySelectorAll(FOCUSABLE)).toHaveLength(0);
  expect(hidden!.querySelector('[role="application"]')).toBeNull();
}

describe("charts inside aria-hidden wrappers", () => {
  it("cost split chart has no focus stop", () => {
    const { container } = render(<CostSplitChart data={mockBlendedResponse} />);
    expectNoHiddenFocusStop(container);
  });

  it("year chart has no focus stop", () => {
    const { container } = render(<YearChart data={mockYearlyResponse} notes={pointNotes(mockYearlyResponse)} />);
    expectNoHiddenFocusStop(container);
  });

  it("driver chart has no focus stop", () => {
    const ups = mockYearlyResponse.carriers.find((c) => c.carrier === "ups")!;
    const row = ups.years.find((y) => y.year === 2026)!;
    const { container } = render(<DriverChart carrier="ups" row={row} dim="speed" />);
    expectNoHiddenFocusStop(container);
  });
});
