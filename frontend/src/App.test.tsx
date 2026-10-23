import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "./api/ApiContext";
import { createMockClient, type ApiClient } from "./api/client";
import { App } from "./App";
import { stubResizeObserver } from "./views/blended/testUtils";

function renderApp(client: ApiClient = createMockClient(0)) {
  return render(
    <ApiProvider client={client}>
      <App />
    </ApiProvider>,
  );
}

describe("App", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("loads the sample mix as a one-line strip, with the full summary on demand", async () => {
    renderApp();
    expect(screen.getByText("No parcels loaded yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load sample mix" }));
    const section = await screen.findByRole("region", { name: /your parcels/i });
    const strip = await within(section).findByText(/to homes/);
    expect(strip.closest("p")).toHaveTextContent(/^307 parcels\d+% to homes/);
    expect(within(section).getByRole("heading", { name: /your parcels/i })).toHaveTextContent("Your parcels · sample mix, an example");
    expect(within(section).queryByRole("table", { name: /weight/i })).not.toBeInTheDocument();

    const details = within(section).getByRole("button", { name: "Details" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(within(section).getByText(/^An illustrative home-goods shop, an example, not real shipping data/)).toBeInTheDocument();
    expect(within(section).getByRole("table", { name: /weight/i })).toBeInTheDocument();
    const zones = within(section).getByRole("table", { name: /distance/i });
    expect(within(zones).getByRole("rowheader", { name: /Zone 1\s*0–50 mi/ })).toBeInTheDocument();
    expect(within(section).getByText(/have their\s+own price/)).toBeInTheDocument();
  });

  it("fills the parcel set from the blended view's empty state", async () => {
    stubResizeObserver();
    renderApp();
    await userEvent.click(screen.getByRole("tab", { name: /blended cost/i }));
    const panel = screen.getByRole("tabpanel");
    await userEvent.click(within(panel).getByRole("button", { name: "Load the sample mix" }));
    const section = await screen.findByRole("region", { name: /your parcels/i });
    expect((await within(section).findByText(/to homes/)).closest("p")).toHaveTextContent(/^307 parcels/);
    expect(await within(screen.getByRole("tabpanel")).findByTestId("q3-answer")).toHaveTextContent("USPS $10.98 per parcel");
  });

  it("opens the parcel panel's file picker from a question's Upload CSV button", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderApp();
    await userEvent.click(screen.getByRole("tab", { name: /year over year/i }));
    await userEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Upload CSV" }));
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.contexts[0]).toBe(screen.getByLabelText("Upload CSV"));
    click.mockRestore();
  });

  it("shows CSV problems with row numbers and keeps the previous set", async () => {
    renderApp();
    const file = new File(["weight_lb,distance_miles,residential,speed\n80,100,true,ground\n"], "march.csv", {
      type: "text/csv",
    });
    await userEvent.upload(screen.getByLabelText("Upload CSV"), file);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("march.csv was not loaded: 1 problem to fix.");
    expect(alert).toHaveTextContent("Row 2");
    expect(alert).toHaveTextContent("over the 70 lb limit");
    expect(screen.getByText("No parcels loaded yet.")).toBeInTheDocument();
  });

  it("mirrors controls and the active question to the URL", async () => {
    renderApp();
    await screen.findByRole("option", { name: "2025" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Price list year" }), "2025");
    await userEvent.click(screen.getByRole("tab", { name: /blended cost/i }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("year")).toBe("2025");
    expect(params.get("view")).toBe("blended");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/Across all your parcels/);
  });

  it("restores state from a shared link", async () => {
    window.history.replaceState(null, "", "/?view=yearly&usps=retail&peak=1");
    renderApp();
    expect(screen.getByRole("tab", { name: /year over year/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: /retail/i })).toBeChecked();
    expect(screen.getByRole("switch", { name: /peak/i })).toBeChecked();
  });

  it("moves between questions with the arrow keys", async () => {
    renderApp();
    const first = screen.getByRole("tab", { name: /quote a parcel/i });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /breakeven map/i })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /year over year/i })).toHaveAttribute("aria-selected", "true");
  });

  it("renders the footer limitations from /api/meta", async () => {
    renderApp();
    expect(await screen.findByText(/List prices only/)).toBeInTheDocument();
  });
});
