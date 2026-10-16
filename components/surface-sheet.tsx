// CSS-only drawer for the agent-facing docs (machine surface + provenance).
// The #sheet-t checkbox in <main> carries the state; these labels drive it,
// so the toggle needs no client JS and works before hydration.

export function SurfaceToggle() {
  return (
    <label htmlFor="sheet-t" className="sheet-open">
      the machine surface
    </label>
  );
}

export function SurfaceClose() {
  return (
    <label htmlFor="sheet-t" className="sheet-close" aria-label="close the machine surface">
      close ✕
    </label>
  );
}
