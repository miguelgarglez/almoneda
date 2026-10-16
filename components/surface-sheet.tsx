"use client";

import { useEffect } from "react";

// CSS-only drawer for the agent-facing docs (machine surface + provenance).
// The #sheet-t checkbox in <main> carries the state; these labels drive it,
// so the toggle needs no client JS and works before hydration. One small
// client effect adds Escape dismissal and hands focus into the sheet.

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

// Escape closes the sheet from anywhere; focus lands on its close control
// when it opens and returns to the open link when it closes.
export function SheetA11y() {
  useEffect(() => {
    let returnFocus: HTMLElement | null = null;
    const onKey = (e: KeyboardEvent) => {
      const t = document.getElementById("sheet-t") as HTMLInputElement | null;
      if (e.key === "Escape" && t?.checked) t.click();
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.id !== "sheet-t") return;
      if (t.checked) {
        returnFocus = document.activeElement as HTMLElement | null;
        document.querySelector<HTMLElement>(".sheet-close")?.focus();
      } else if (returnFocus) {
        returnFocus.focus();
        returnFocus = null;
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("change", onChange);
    };
  }, []);
  return null;
}

