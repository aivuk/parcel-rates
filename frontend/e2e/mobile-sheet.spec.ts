import { expect, test } from "@playwright/test";
import { isMobile, openApp } from "./helpers";

test.describe("Settings sheet on phones", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isMobile(info), "the sheet exists only below 64 rem");
    await openApp(page);
  });

  test("opens as a modal dialog, traps focus and closes on Escape", async ({ page }) => {
    const adjust = page.getByRole("button", { name: "Adjust" });
    await expect(page.getByRole("complementary", { name: "Assumptions" })).toBeHidden();
    await adjust.click();
    const sheet = page.getByRole("dialog", { name: "Assumptions" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await expect(adjust).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("main")).toHaveAttribute("inert", "");

    // Focus starts inside and Tab wraps around without leaving the sheet.
    const inSheet = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(await inSheet()).toBe(true);
    const first = await page.evaluate(() => document.activeElement?.outerHTML);
    const visited = new Set<string>();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await inSheet()).toBe(true);
      visited.add(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
    }
    // The trap must not skip the disclosure at the end of the sheet.
    expect(visited).toContain("About these assumptions");
    await page.keyboard.press("Shift+Tab");
    expect(await inSheet()).toBe(true);
    expect(first).toBeTruthy();

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(adjust).toBeFocused();
    await expect(adjust).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  });
});
