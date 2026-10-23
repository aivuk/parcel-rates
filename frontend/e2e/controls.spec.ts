import { expect, test } from "@playwright/test";
import { closeSettings, nextResponse, openApp, openSettings, quoteTotal } from "./helpers";

type QuoteBody = { controls: { year?: number; usps_rate_card?: string; peak?: boolean; fuel_override_percent?: Record<string, number> } };

test.describe("Global controls", () => {
  test.beforeEach(async ({ page }) => {
    const quote = nextResponse(page, "/api/quote");
    await openApp(page);
    expect((await quote).ok()).toBe(true);
  });

  test("2027 prices show the FedEx-only note", async ({ page }, info) => {
    const settings = await openSettings(page, info);
    const quote = nextResponse(page, "/api/quote");
    await settings.getByLabel("Price list year").selectOption("2027");
    expect(((await quote).request().postDataJSON() as QuoteBody).controls.year).toBe(2027);
    await closeSettings(page, info);
    await expect(page.getByRole("note").filter({ hasText: "2027 prices are published by FedEx only" })).toBeVisible();
    await expect(page.locator(".masthead__edition")).toContainText("2027");
  });

  test("USPS retail prices change the Q1 total", async ({ page }, info) => {
    const commercial = await quoteTotal(page);
    const settings = await openSettings(page, info);
    const quote = nextResponse(page, "/api/quote");
    await settings.getByRole("radio", { name: /Retail/ }).check();
    expect(((await quote).request().postDataJSON() as QuoteBody).controls.usps_rate_card).toBe("retail");
    await closeSettings(page, info);
    await expect(page.getByTestId("quote-answer")).not.toHaveText(commercial);
    const retail = await quoteTotal(page);
    expect(Number(retail.slice(1))).toBeGreaterThan(Number(commercial.slice(1)));
  });

  test("fuel slider override and reset", async ({ page }, info) => {
    const settings = await openSettings(page, info);
    const ground = settings.getByRole("slider", { name: "Ground" });
    const value = settings.locator('.fuel[data-group="ground"] .fuel__value');
    const before = await value.innerText();
    const quote = nextResponse(page, "/api/quote");
    await ground.focus();
    await page.keyboard.press("ArrowRight");
    await expect(value).not.toHaveText(before);
    const body = (await quote).request().postDataJSON() as QuoteBody;
    expect(body.controls.fuel_override_percent?.ground).toBeDefined();
    await expect(page).toHaveURL(/fuel_ground=/);

    const reset = settings.getByRole("button", { name: /Reset\s+ground fuel/ });
    await reset.click();
    await expect(value).toHaveText(before);
    await expect(reset).toHaveCount(0);
    await expect(page).not.toHaveURL(/fuel_ground=/);
    await closeSettings(page, info);
  });

  test("peak toggle prices inside the peak window", async ({ page }, info) => {
    const settings = await openSettings(page, info);
    const quote = nextResponse(page, "/api/quote");
    const peak = settings.getByRole("switch", { name: "Peak season surcharges" });
    await peak.check();
    await expect(peak).toBeChecked();
    expect(((await quote).request().postDataJSON() as QuoteBody).controls.peak).toBe(true);
    await expect(page).toHaveURL(/peak=1/);
    await closeSettings(page, info);
    if (info.project.name === "mobile") await expect(page.locator(".mobile-bar__line")).toContainText("peak");
  });

  test("URL state survives a reload", async ({ page }, info) => {
    const settings = await openSettings(page, info);
    await settings.getByLabel("Price list year").selectOption("2025");
    await settings.getByRole("radio", { name: /Retail/ }).check();
    await closeSettings(page, info);
    await page.locator("#tab-breakeven").click();
    await expect(page).toHaveURL(/year=2025/);
    await expect(page).toHaveURL(/usps=retail/);
    await expect(page).toHaveURL(/view=breakeven/);

    const breakeven = nextResponse(page, "/api/breakeven");
    await page.reload();
    const body = (await breakeven).request().postDataJSON() as QuoteBody;
    expect(body.controls.year).toBe(2025);
    expect(body.controls.usps_rate_card).toBe("retail");
    await expect(page.locator("#tab-breakeven")).toHaveAttribute("aria-selected", "true");
    const again = await openSettings(page, info);
    await expect(again.getByLabel("Price list year")).toHaveValue("2025");
    await expect(again.getByRole("radio", { name: /Retail/ })).toBeChecked();
  });
});
