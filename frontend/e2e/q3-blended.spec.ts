import { expect, test } from "@playwright/test";
import { closeSettings, loadSample, nextResponse, openApp, openSettings, showView } from "./helpers";

test.describe("Q3, blended cost of the parcel set", () => {
  test("asks for parcels until a set is loaded", async ({ page }) => {
    await openApp(page);
    await page.locator("#tab-blended").click();
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /sample/i })).toBeVisible();
  });

  test("answer, loss verdict and a segment chip that re-queries", async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await showView(page, "blended");

    await expect(page.getByTestId("q3-answer")).toContainText(/USPS\s*\$\d+\.\d{2}/);
    const verdict = page.getByTestId("q3-verdict");
    await expect(verdict).toContainText(/^(No|Yes)\./);
    await expect(page.getByTestId("q3-loss-share")).toContainText("of parcels");
    const count = page.locator(".q-count");
    await expect(count).toContainText("307 of 307 parcels");

    const res = nextResponse(page, "/api/blended");
    const chip = page.getByRole("group", { name: "Weight" }).getByRole("button", { name: "1–5 lb" });
    await chip.click();
    const body = (await res).request().postDataJSON() as { segment?: { weight_band?: string } };
    expect(body.segment?.weight_band).toBe("1–5");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(count).not.toContainText("307 of 307");
    await expect(count).toContainText(/\d+ of 307 parcels in this segment/);
    await expect(page.getByTestId("q3-segment-result")).toContainText("cheapest");
    await expect(page.getByTestId("q3-answer")).toBeVisible();
  });

  test("free shipping from an order value charges those parcels nothing", async ({ page }, info) => {
    await openApp(page);
    await loadSample(page);
    await showView(page, "blended");
    await expect(page.getByTestId("q3-free")).toHaveCount(0);

    const settings = await openSettings(page, info);
    const res = nextResponse(page, "/api/blended");
    const free = settings.getByRole("textbox", { name: "Free shipping from order value" });
    await free.fill("75");
    await free.press("Enter");
    const body = (await res).request().postDataJSON() as { controls?: { free_shipping_over?: number } };
    expect(body.controls?.free_shipping_over).toBe(75);
    await closeSettings(page, info);

    await expect(page.getByTestId("q3-free")).toContainText(/\d+ of 307 parcels ship free/);
    await expect(page.getByTestId("q3-verdict")).toContainText("No. You lose");
    expect(new URL(page.url()).searchParams.get("free_over")).toBe("75");
  });
});

