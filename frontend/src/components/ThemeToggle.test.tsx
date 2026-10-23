import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_KEY } from "../lib/theme";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
});

describe("ThemeToggle", () => {
  it("starts from the theme already set and switches and remembers it", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: "Dark mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("follows a theme change made elsewhere (the system, before a choice is saved)", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);
    document.documentElement.setAttribute("data-theme", "dark");
    expect(await screen.findByRole("button", { name: "Dark mode", pressed: true })).toBeInTheDocument();
  });
});
