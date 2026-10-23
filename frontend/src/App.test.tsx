import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "./api/ApiContext";
import { createMockClient, type ApiClient } from "./api/client";
import { App } from "./App";

function renderApp(client: ApiClient = createMockClient(0)) {
  return render(
    <ApiProvider client={client}>
      <App />
    </ApiProvider>,
  );
}

describe("App", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("loads the sample mix and shows the set summary", async () => {
    renderApp();
    expect(screen.getByText("No parcels loaded yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load sample mix" }));
    const section = await screen.findByRole("region", { name: "Your parcels" });
    expect(await within(section).findByText("791")).toBeInTheDocument();
    expect(within(section).getByText(/Illustrative month/)).toBeInTheDocument();
    expect(within(section).getByRole("table", { name: /weight/i })).toBeInTheDocument();
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
    expect(await screen.findByText(/Published list prices only/)).toBeInTheDocument();
  });
});
