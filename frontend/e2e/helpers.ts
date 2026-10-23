import { expect, type Locator, type Page, type Response, type TestInfo } from "@playwright/test";

export type ViewId = "quote" | "breakeven" | "blended" | "yearly";

export const isMobile = (info: TestInfo) => info.project.name === "mobile";

/** Wait for the next answer from an API endpoint, e.g. `nextResponse(page, "/api/quote")`. */
export function nextResponse(page: Page, path: string, method = "POST"): Promise<Response> {
  return page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === method);
}

/** Open the app (optionally with a query string) and wait until the price lists have loaded. */
export async function openApp(page: Page, search = ""): Promise<void> {
  const meta = nextResponse(page, "/api/meta", "GET");
  await page.goto(`/${search}`);
  expect((await meta).ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Parcel Rates" })).toBeVisible();
}

/** Click "Load sample mix" and wait for the strip to show the parcel count. */
export async function loadSample(page: Page): Promise<void> {
  const sample = nextResponse(page, "/api/sample-parcels", "GET");
  await page.getByRole("button", { name: "Load sample mix" }).click();
  expect((await sample).ok()).toBe(true);
  await expect(page.locator(".strip__count")).toContainText("307 parcels");
}

export const tab = (page: Page, view: ViewId): Locator => page.locator(`#tab-${view}`);
export const panel = (page: Page): Locator => page.getByRole("tabpanel");

/** Switch to a question and wait for its API answer. */
export async function showView(page: Page, view: ViewId): Promise<void> {
  if (view === "quote") {
    await tab(page, view).click();
    await expect(page.getByTestId("quote-answer")).toBeVisible();
    return;
  }
  // Q4 asks twice: once with the controls, then again with the next-year increase its first
  // answer suggests. Wait for the second, or the view is still dimmed as "stale".
  const answer =
    view === "yearly"
      ? page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/yearly" && "next_year_increase_percent" in (r.request().postDataJSON() ?? {}),
        )
      : nextResponse(page, `/api/${view}`);
  await tab(page, view).click();
  expect((await answer).ok()).toBe(true);
  const id = { breakeven: "breakeven-answer", blended: "q3-answer", yearly: "q4-answer" }[view];
  await expect(page.getByTestId(id)).toBeVisible();
}

/** The settings: the side rail on desktop, the bottom sheet behind "Adjust" on phones. */
export async function openSettings(page: Page, info: TestInfo): Promise<Locator> {
  if (isMobile(info)) {
    await page.getByRole("button", { name: "Adjust" }).click();
    const sheet = page.getByRole("dialog", { name: "Assumptions" });
    await expect(sheet).toBeVisible();
    return sheet;
  }
  return page.getByRole("complementary", { name: "Assumptions" });
}

export async function closeSettings(page: Page, info: TestInfo): Promise<void> {
  if (!isMobile(info)) return;
  await page.getByRole("dialog", { name: "Assumptions" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: "Assumptions" })).toHaveCount(0);
}

/** The Q1 form, by its accessible name. */
export const quoteForm = (page: Page): Locator => page.getByRole("form", { name: "Your parcel" });

/** Replace a text input's value and wait for the quote the change triggers (debounced 300 ms). */
export async function fillAndQuote(page: Page, input: Locator, value: string): Promise<Response> {
  const quote = nextResponse(page, "/api/quote");
  await input.fill(value);
  return quote;
}

/** Set the Q1 box size and wait for the new quote. */
export async function setBox(page: Page, l: string, w: string, h: string): Promise<void> {
  const form = quoteForm(page);
  await form.getByLabel("Length in inches").fill(l);
  await form.getByLabel("Width in inches").fill(w);
  const quote = nextResponse(page, "/api/quote");
  await form.getByLabel("Height in inches").fill(h);
  expect((await quote).ok()).toBe(true);
  await expect(page.locator(".is-stale")).toHaveCount(0);
}

/** Text of the Q1 answer figure once the answer on screen is fresh. */
export async function quoteTotal(page: Page): Promise<string> {
  await expect(page.locator(".qv__answer")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".is-stale")).toHaveCount(0);
  return (await page.getByTestId("quote-answer").innerText()).trim();
}

/** No request in flight, nothing dimmed as stale, and every CSS transition finished. */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator(".is-stale")).toHaveCount(0);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}
