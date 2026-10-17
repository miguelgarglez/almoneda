"use client";

import { useEffect, useState } from "react";

type StripSale = {
  id: number;
  tx?: string;
  network: string;
  amount: string;
  lot_title?: string | null;
  query_hint?: string;
  endpoint?: string;
  created_at: string;
};

const railAmt = (s: StripSale) =>
  s.network?.startsWith("stellar") ? `${(parseInt(s.amount, 10) / 1e7).toFixed(2)} XLM` : `$${(parseInt(s.amount, 10) / 1e6).toFixed(2)}`;

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

// The strip is a working instrument, not a slogan: every item is a real
// settled sale, and picking one opens its receipt on the floor. It pauses
// under the pointer so it can actually be aimed at.
export default function SettleStrip({ initial }: { initial: StripSale[] }) {
  const [sales, setSales] = useState(initial);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        if (Array.isArray(j?.sales?.recent)) setSales(j.sales.recent);
      } catch {}
    };
    let resume: ReturnType<typeof setTimeout> | null = null;
    const onSale = () => {
      tick();
      // when the hammer falls the strip stands down — ambient motion stops
      // competing with the settlement moment, then resumes
      setPaused(true);
      if (resume) clearTimeout(resume);
      resume = setTimeout(() => setPaused(false), 5000);
    };
    // the strip quiets for the whole settlement arc — from the bid going on
    // the wire to a few beats after the receipt lands — so the strike owns
    // the screen instead of sharing it with a moving ticker
    const onSettling = () => {
      setPaused(true);
      if (resume) clearTimeout(resume);
    };
    const onSettlingEnd = () => {
      if (resume) clearTimeout(resume);
      resume = setTimeout(() => setPaused(false), 7000);
    };
    window.addEventListener("almoneda:sale", onSale);
    window.addEventListener("almoneda:settling", onSettling);
    window.addEventListener("almoneda:settling-end", onSettlingEnd);
    const t = setInterval(tick, 15_000);
    return () => {
      window.removeEventListener("almoneda:sale", onSale);
      window.removeEventListener("almoneda:settling", onSettling);
      window.removeEventListener("almoneda:settling-end", onSettlingEnd);
      clearInterval(t);
      if (resume) clearTimeout(resume);
    };
  }, []);

  const items = sales.filter((s) => s.tx);
  if (!items.length) return null;

  const open = (s: StripSale) => {
    window.dispatchEvent(new CustomEvent("almoneda:open-sale", { detail: { tx: s.tx } }));
  };

  const label = (s: StripSale) => `${railAmt(s)} — ${s.lot_title || s.query_hint || s.endpoint || "a lot"} — ${ago(s.created_at)} ago`;

  return (
    <div className={`ticker live${paused ? " paused" : ""}`} role="navigation" aria-label="recent settlements — pick one to open its receipt">
      <div className="rail">
        {[...items, ...items].map((s, i) => (
          <button type="button" key={`${s.id}-${i}`} className="tick-item" onClick={() => open(s)} tabIndex={i < items.length ? 0 : -1}>
            <b>sold</b> {label(s)}
          </button>
        ))}
      </div>
    </div>
  );
}
