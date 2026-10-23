import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "../api/ApiContext";
import { createMockClient } from "../api/client";
import { App } from "../App";
import { SHEET_QUERY } from "../hooks/useSheet";

function setViewport(mobile: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === SHEET_QUERY ? mobile : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const renderApp = () =>
  render(
    <ApiProvider client={createMockClient(0)}>
      <App />
    </ApiProvider>,
  );

describe("settings sheet on a phone", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    setViewport(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is a named modal dialog that takes focus and makes the page inert", async () => {
    renderApp();
    const opener = screen.getByRole("button", { name: "Adjust" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Assumptions" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
    expect(opener.closest(".mobile-bar")).toHaveAttribute("inert");
  });

  it("wraps Tab and Shift+Tab inside the sheet", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Adjust" }));
    const done = screen.getByRole("button", { name: "Done" });
    const price = screen.getByRole("textbox", { name: /flat price/i });
    expect(done).toHaveFocus();

    price.focus();
    await userEvent.tab();
    expect(done).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(price).toHaveFocus();
  });

  it("returns focus to the opener and lifts inert on Escape and on Done", async () => {
    renderApp();
    const opener = screen.getByRole("button", { name: "Adjust" });
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");

    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(opener).toHaveFocus();
  });

  it("is a plain labelled region, not a dialog, on desktop", () => {
    setViewport(false);
    renderApp();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Assumptions" })).toBeInTheDocument();
  });
});
