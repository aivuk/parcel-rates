/** Light or dark, as set on <html data-theme> by public/theme.js (saved choice or system). */
export type Theme = "light" | "dark";

/** Same key as public/theme.js. */
export const THEME_KEY = "parcel-rates-theme";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Apply a theme now and remember it, so it wins over the system setting from then on. */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows and blocked storage: the choice holds for this page only.
  }
}
