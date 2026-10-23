import { useCallback, useEffect, useRef, useState } from "react";

/** Mirrors the CSS breakpoint below which the settings rail becomes a bottom sheet. */
export const SHEET_QUERY = "(max-width: 63.999rem)";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Elements marked with this attribute become inert while the sheet is open. */
export const INERT_WHILE_SHEET = "data-inert-while-sheet";

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[hidden]"));
}

/**
 * Modal bottom sheet: focus moves in on open, Tab and Shift+Tab wrap inside it, the rest of the
 * page is inert, Escape closes, and focus returns to the button that opened it.
 */
export function useSheet(isSheet: boolean) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const active = open && isSheet;

  // Focus goes back to the opener in the effect cleanup, after `inert` is lifted from it.
  const close = useCallback(() => setOpen(false), []);

  // Growing past the breakpoint turns the sheet back into the always-visible rail.
  useEffect(() => {
    if (!isSheet) setOpen(false);
  }, [isSheet]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!active || !sheet) return;
    focusables(sheet)[0]?.focus();

    const outside = [...document.querySelectorAll<HTMLElement>(`[${INERT_WHILE_SHEET}]`)];
    outside.forEach((el) => el.setAttribute("inert", ""));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(sheet);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !sheet.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !sheet.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      outside.forEach((el) => el.removeAttribute("inert"));
      toggleRef.current?.focus();
    };
  }, [active, close]);

  return { open: active, setOpen, close, toggleRef, sheetRef };
}
