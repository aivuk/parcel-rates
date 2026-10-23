import { expect, test } from "@playwright/test";
import { closeSettings, fillAndQuote, loadSample, nextResponse, openApp, openSettings, quoteForm, quoteTotal, setBox } from "./helpers";

test.describe("Q1, quote one parcel", () => {
  test.beforeEach(async ({ page }) => {
    const quote = nextResponse(page, "/api/quote");
    await openApp(page);
    expect((await quote).ok()).toBe(true);
  });

  test("the sample mix loads and the strip shows the count", async ({ page }) => {
    await loadSample(page);
    await expect(page.locator(".strip__facts")).toContainText("80% to homes");
    await expect(page.getByRole("combobox", { name: "Start from one of your parcels" })).toBeVisible();
  });

  test("a typical parcel: answer figure, cheapest carrier, line items with a source", async ({ page }) => {
    // Default form: 3 lb, 12×10×6 in, 600 miles, to a home, ground.
    expect(await quoteTotal(page)).toMatch(/^\$\d+\.\d{2}$/);
    await expect(page.locator(".qa__service")).toContainText("USPS Ground Advantage");
    await expect(page.locator(".qa__margin")).toContainText(/margin|loss/);

    const rows = page.locator(".qrank > li");
    await expect(rows).toHaveCount(3);
    await expect(rows.first().locator(".qr__delta")).toHaveText("cheapest");

    const first = rows.first().getByRole("button");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    const items = rows.first().getByRole("table");
    await expect(items).toBeVisible();
    await expect(items.locator(".qitems__row--base")).toHaveCount(1);
    await expect(items.locator("cite.qitems__src").first()).not.toBeEmpty();
    await expect(items.locator("tfoot")).toContainText(await page.getByTestId("quote-answer").innerText());
  });

  test("a bulky light box shows the billed-by-size note", async ({ page }) => {
    await setBox(page, "24", "20", "18");
    await expect(page.getByRole("heading", { name: "Billed by size, not weight" })).toBeVisible();
    await expect(page.locator(".qdim__text")).toContainText("this 3 lb box is billed as up to");
  });

  test("changing the speed tier re-prices the parcel", async ({ page }) => {
    const ground = await quoteTotal(page);
    const quote = nextResponse(page, "/api/quote");
    await quoteForm(page).getByRole("radio", { name: "Next day" }).check();
    await quote;
    await expect(page.locator(".qa").locator(".kicker")).toContainText("Next day");
    const nextDay = await quoteTotal(page);
    expect(Number(nextDay.slice(1))).toBeGreaterThan(Number(ground.slice(1)));
    await expect(page.getByRole("heading", { name: "Every carrier, next day" })).toBeVisible();
  });

  test("a weight over 70 lb shows the server's message at the input", async ({ page }) => {
    const pounds = quoteForm(page).getByLabel("Weight in pounds");
    const res = await fillAndQuote(page, pounds, "75");
    expect(res.status()).toBe(422);
    await expect(pounds).toHaveAttribute("aria-invalid", "true");
    const describedBy = await pounds.getAttribute("aria-describedby");
    const message = page.locator(`[id="${describedBy}"]`);
    await expect(message).toBeVisible();
    await expect(message).toContainText(/70/);
    await expect(page.locator(".qa__none")).toBeVisible();
  });

  test("a destination ZIP with a ship-from ZIP: USPS from its chart, UPS and FedEx estimated", async ({ page }, info) => {
    const settings = await openSettings(page, info);
    const from = settings.getByRole("textbox", { name: "Ship from ZIP" });
    await from.fill("10001");
    await from.press("Enter");
    await closeSettings(page, info);
    await expect.poll(() => new URL(page.url()).searchParams.get("from")).toBe("10001");

    const res = await fillAndQuote(page, quoteForm(page).getByLabel("Destination ZIP"), "90210");
    const body = res.request().postDataJSON() as { parcel: Record<string, unknown>; controls: Record<string, unknown> };
    expect(body.parcel.destination_zip).toBe("90210");
    expect(body.controls.origin_zip).toBe("10001");
    await expect(quoteForm(page).getByText(/USPS zone 8 \(zone chart\)/)).toBeVisible();
    await expect(quoteForm(page).getByText(/UPS zone \d \(estimated\)/)).toBeVisible();
    await expect(quoteForm(page).getByLabel(/^Distance/)).toBeDisabled();
    await expect(quoteForm(page).getByLabel(/^Distance/)).toHaveValue(/^2,4\d\d$/);
  });
});

