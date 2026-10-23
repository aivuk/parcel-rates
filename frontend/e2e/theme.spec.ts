import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.describe("Light and dark mode", () => {
  test("follows the system, then the owner's choice, which survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openApp(page);
    const html = page.locator("html");
    const toggle = page.getByRole("button", { name: "Dark mode" });
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const darkPaper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(darkPaper);

    await openApp(page);
    await expect(html).toHaveAttribute("data-theme", "light"); // the saved choice beats the dark system
  });
});
