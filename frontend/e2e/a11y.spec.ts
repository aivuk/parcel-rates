import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loadSample, openApp, settled, showView, type ViewId } from "./helpers";

/**
 * axe on every question view, light and dark. Serious and critical violations fail the test;
 * moderate and minor ones are attached to the report for review. No exclusions: the chart SVGs
 * sit inside aria-hidden wrappers (the caption and "Show as table" carry the content) and pass.
 */
const VIEWS: ViewId[] = ["quote", "breakeven", "blended", "yearly"];
const BLOCKING = new Set(["serious", "critical"]);

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const view of VIEWS) {
      test(`${view} has no serious or critical violations`, async ({ page }, info) => {
        await openApp(page);
        await loadSample(page);
        await showView(page, view);
        await settled(page);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
          .analyze();
        await info.attach("axe-violations.json", {
          body: JSON.stringify(results.violations, null, 2),
          contentType: "application/json",
        });
        const blocking = results.violations
          .filter((v) => BLOCKING.has(v.impact ?? ""))
          .map(
            (v) =>
              `${v.impact} ${v.id}: ${v.help}\n  ${v.nodes
              .slice(0, 5)
              .map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`)
              .join("\n  ")}`,
          );
        expect(blocking, blocking.join("\n")).toEqual([]);
      });
    }
  });
}
