import { useEffect, useState } from "react";

const DARK = "(prefers-color-scheme: dark)";

/** Resolve CSS custom properties to concrete colours (for Recharts); re-resolves when the colour scheme flips. */
export function useCssColors<K extends string>(vars: Record<K, string>): Record<K, string> {
  const read = () => {
    const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const out = {} as Record<K, string>;
    for (const k in vars) out[k] = style?.getPropertyValue(vars[k]).trim() || "currentColor";
    return out;
  };
  const [colors, setColors] = useState(read);
  const key = JSON.stringify(vars);
  useEffect(() => {
    setColors(read());
    const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DARK) : null;
    if (!mq) return;
    const onChange = () => setColors(read());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return colors;
}
