"use client";

import { useEffect } from "react";

// CSS-only drawer for the agent-facing docs (machine surface + provenance).
// The #sheet-t checkbox in <main> carries the state; these labels drive it,
// so the toggle needs no client JS and works before hydration. One small
// client effect adds Escape dismissal, focus containment, and an inert
// background while the sheet is open.

const keyClick = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    document.getElementById("sheet-t")?.click();
  }
};

export function SurfaceToggle() {
  return (
    <label htmlFor="sheet-t" className="sheet-open" tabIndex={0} role="button" onKeyDown={keyClick}>
      the machine surface
    </label>
  );
}

export function SurfaceClose() {
  return (
    <label htmlFor="sheet-t" className="sheet-close" aria-label="close the machine surface" tabIndex={0} role="button" onKeyDown={keyClick}>
      close ✕
    </label>
  );
}

// While the sheet is open, the floor behind it leaves the tab order entirely
// (inert) and Tab cycles inside the sheet; Escape closes it from anywhere and
// focus returns to the open link.
export function SheetA11y() {
  useEffect(() => {
    let returnFocus: HTMLElement | null = null;
    const isDesktop = () => matchMedia("(min-width: 1024px)").matches;
    const setBg = (on: boolean) => {
      // everything in <main> except the checkbox and the sheet itself
      for (const el of document.querySelectorAll<HTMLElement>("main > *")) {
        if (el.classList.contains("sheet") || el.classList.contains("sheet-t")) continue;
        if (on) el.setAttribute("inert", "");
        else el.removeAttribute("inert");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = document.getElementById("sheet-t") as HTMLInputElement | null;
      if (!t?.checked) return;
      if (e.key === "Escape") {
        t.click();
        return;
      }
      if (e.key === "Tab" && isDesktop()) {
        const sheet = document.querySelector<HTMLElement>(".sheet");
        if (!sheet) return;
        const focusables = Array.from(
          sheet.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"]), label[for]')
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !sheet.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !sheet.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.id !== "sheet-t") return;
      if (t.checked) {
        returnFocus = document.activeElement as HTMLElement | null;
        if (isDesktop()) setBg(true);
        document.querySelector<HTMLElement>(".sheet-close")?.focus();
      } else {
        setBg(false);
        if (returnFocus) {
          returnFocus.focus();
          returnFocus = null;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("change", onChange);
      setBg(false);
    };
  }, []);
  return null;
}
