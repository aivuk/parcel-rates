import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

const HEADER = "weight_lb,length_in,width_in,height_in,distance_miles,residential,speed,quantity";

function csv(rows: string[]) {
  return { name: "parcels.csv", mimeType: "text/csv", buffer: Buffer.from([HEADER, ...rows].join("\n") + "\n") };
}

test.describe("CSV upload", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test("a small valid file loads into the strip", async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(
      csv(["2,10,8,4,300,true,ground,5", "12,18,14,10,1500,false,two_three_day,2", "0.5,,,,80,true,next_day,1"]),
    );
    await expect(page.locator(".strip__count")).toContainText("8 parcels");
    await expect(page.locator(".strip__source")).toContainText("parcels.csv");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("a file with an error names the row", async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(csv(["2,10,8,4,300,true,ground,5", "95,10,8,4,300,true,ground,1"]));
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert.locator(".problems__where").first()).toHaveText("Row 3");
    await expect(alert).toContainText("70");
    await expect(page.locator(".strip__count")).toHaveCount(0);
  });
});
