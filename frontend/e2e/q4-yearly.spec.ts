import { expect, test } from "@playwright/test";
import { isMobile, loadSample, openApp, showView } from "./helpers";

test.describe("Q4, year over year", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await showView(page, "yearly");
  });

  test("answer and the dollars/index toggle", async ({ page }, info) => {
    await expect(page.getByTestId("q4-answer")).toHaveText(/[+−-]?\d+(\.\d)?%/);
    await expect(page.getByTestId("q4-caption")).toBeVisible();
    const scale = page.getByRole("group", { name: "Scale" });
    const dollars = scale.getByRole("button", { name: "Dollars", exact: true });
    const index = scale.getByRole("button", { name: "Index (first year = 100)", exact: true });
    // Index is the default on phones, dollars on desktop.
    await expect(isMobile(info) ? index : dollars).toHaveAttribute("aria-pressed", "true");
    const other = isMobile(info) ? dollars : index;
    await other.click();
    await expect(other).toHaveAttribute("aria-pressed", "true");
  });

  test("the next-year slider updates the projection", async ({ page }) => {
    const projection = page.getByTestId("q4-projection");
    const before = await projection.innerText();
    const slider = page.getByRole("slider", { name: /^Increase for/ });
    await slider.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
    await expect(projection).not.toHaveText(before);
    const reset = page.getByRole("button", { name: /^Reset to/ });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(projection).toHaveText(before);
  });

  test("driver chips switch the breakdown", async ({ page }) => {
    const drivers = page.getByRole("region", { name: "What drove the change" });
    const sentence = page.getByTestId("driver-sentence");
    await expect(sentence).not.toBeEmpty();
    const split = drivers.getByRole("group", { name: "Split by" });
    const options = split.getByRole("button");
    const unpressed = split.locator('button[aria-pressed="false"]').first();
    const label = (await unpressed.innerText()).trim();
    expect(await options.count()).toBeGreaterThan(1);
    await unpressed.click();
    await expect(split.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    await expect(drivers.locator(".chart__title")).toContainText(label.toLowerCase());
  });
});
