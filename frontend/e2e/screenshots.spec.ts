import { test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMobile, loadSample, openApp, openSettings, setBox, settled, showView, type ViewId } from "./helpers";

/**
 * Full-page captures of every view for the UX review (docs/ux-review.md), run with
 * `npm run e2e:update-screens`. Deterministic: the fixed sample mix, default controls,
 * the default quote form, reduced motion, settled charts and the page scrolled to the top.
 */
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "screenshots");

/** Resolve once nothing inside the charts has changed for a few frames (Recharts animates in). */
async function chartsSettled(page: Page): Promise<void> {
  // A function passed to evaluate, not waitForFunction: the app's CSP forbids string eval.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = "";
        let same = 0;
        const tick = () => {
          const snap = [...document.querySelectorAll(".recharts-wrapper, .hm__svg")].map((e) => e.innerHTML).join("|");
          same = snap === last ? same + 1 : 0;
          last = snap;
          if (same >= 5) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

async function capture(page: Page, name: string, project: string, scheme: string): Promise<void> {
  await settled(page);
  await page.evaluate(() => document.fonts.ready);
  await chartsSettled(page);
  // The settings rail is sticky: without this it lands mid-page in a full-page capture.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({
    path: path.join(DIR, `${name}-${project}-${scheme}.png`),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

const VIEWS: { name: string; view: ViewId; setup?: (page: Page) => Promise<void> }[] = [
  {
    name: "q1-typical",
    view: "quote",
    setup: async (page) => {
      // Open the cheapest row so the line items and their sources are in the shot.
      await page.locator(".qrank > li").first().getByRole("button").click();
    },
  },
  { name: "q1-bulky", view: "quote", setup: (page) => setBox(page, "24", "20", "18") },
  { name: "q2", view: "breakeven" },
  { name: "q3", view: "blended" },
  { name: "q4", view: "yearly" },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`screens, ${scheme} @screens`, () => {
    test.use({ colorScheme: scheme, contextOptions: { reducedMotion: "reduce" } });

    for (const v of VIEWS) {
      test(v.name, async ({ page }, info) => {
        await openApp(page);
        await loadSample(page);
        await showView(page, v.view);
        await v.setup?.(page);
        await capture(page, v.name, info.project.name, scheme);
      });
    }

    test("settings-sheet", async ({ page }, info) => {
      test.skip(!isMobile(info), "the sheet exists on phones only");
      await openApp(page);
      await loadSample(page);
      await showView(page, "quote");
      await page.evaluate(() => window.scrollTo(0, 0));
      await openSettings(page, info);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(DIR, `settings-sheet-${info.project.name}-${scheme}.png`), animations: "disabled", caret: "hide" });
    });
  });
}
