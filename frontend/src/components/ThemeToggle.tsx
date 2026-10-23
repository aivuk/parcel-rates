import { useEffect, useState } from "react";
import { currentTheme, setTheme, type Theme } from "../lib/theme";

/** "Dark mode" on or off; starts from the system setting until the owner chooses. */
export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(currentTheme);
  // public/theme.js follows the system until a choice is saved; mirror its changes.
  useEffect(() => {
    const observer = new MutationObserver(() => setLocal(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      onClick={() => {
        const next: Theme = dark ? "light" : "dark";
        setTheme(next);
        setLocal(next);
      }}
    >
      <span className="theme-toggle__box" aria-hidden="true" />
      Dark mode
    </button>
  );
}
