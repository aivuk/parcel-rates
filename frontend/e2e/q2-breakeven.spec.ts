import { expect, test } from "@playwright/test";
import { nextResponse, openApp, showView } from "./helpers";

test.describe("Q2, breakeven map", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await showView(page, "breakeven");
  });

  test("the map renders with a figure, a readout and a legend", async ({ page }) => {
    await expect(page.getByTestId("breakeven-answer")).toHaveText(/^\d+ lb$/);
    await expect(page.getByRole("list", { name: "Breakeven by distance" }).getByRole("listitem").first()).toBeVisible();
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    // 70 weights by 8 distance bands.
    await expect(grid.getByRole("gridcell")).toHaveCount(70 * 8);
    await expect(page.getByRole("group", { name: "Legend" })).toContainText("USPS");
  });

  test("the home/business toggle changes the answer sentence", async ({ page }) => {
    const caption = page.locator(".bv__caption");
    const homes = await caption.innerText();
    expect(homes).toContain("home delivery");
    const res = nextResponse(page, "/api/breakeven");
    await page.getByRole("radio", { name: "Businesses" }).check();
    expect((await res).ok()).toBe(true);
    await expect(page.locator(".bv__answer .kicker")).toContainText("business delivery");
    await expect(caption).not.toHaveText(homes);
  });

  test("keyboard focus on a cell shows its prices", async ({ page }) => {
    const cells = page.getByRole("gridcell");
    await cells.first().focus();
    const tip = page.locator(".hm__tip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("USPS");
    await page.keyboard.press("ArrowRight");
    await expect(cells.nth(1)).toBeFocused();
    await expect(cells.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
  });

  test("Show as table swaps the map for a table", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Show as table" });
    await toggle.click();
    await expect(page.getByRole("grid")).toHaveCount(0);
    const table = page.locator(".hmt__table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(70);
    await page.getByRole("button", { name: "Show as map" }).click();
    await expect(page.getByRole("grid")).toBeVisible();
  });
});
