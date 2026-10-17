"use client";

import { useEffect, useRef, useState } from "react";

type Last = { query_hint: string | null; endpoint: string; amount: string; network: string };

// The statbar is server-rendered, but the floor counts move the moment a
// settlement lands. Listen for the console's sale event: take the hammer
// readout and +1 from the wire's own detail (the CDN can still be serving a
// pre-sale /v1/floor at that instant), then reconcile against the ledger.
export default function LiveStats({ initialTotal, initialLast }: { initialTotal: number; initialLast: Last | null }) {
  const [total, setTotal] = useState(initialTotal);
  const [last, setLast] = useState<Last | null>(initialLast);
  const [pendingN, setPendingN] = useState(0);
  const pendingTx = useRef(new Map<string, number>());

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        if (typeof j?.sales?.total === "number") setTotal(j.sales.total);
        const n = j?.sales?.recent?.[0];
        if (n) setLast({ query_hint: n.query_hint, endpoint: n.endpoint, amount: n.amount, network: n.network });
        if (Array.isArray(j?.sales?.recent)) {
          const seen = new Set(j.sales.recent.map((s: { tx?: string }) => s.tx));
          for (const [tx, at] of pendingTx.current) if (seen.has(tx) || Date.now() - at > 120_000) pendingTx.current.delete(tx);
          setPendingN(pendingTx.current.size);
        }
      } catch {}
    };
    const onSale = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.tx && !pendingTx.current.has(d.tx)) {
        pendingTx.current.set(d.tx, Date.now());
        setPendingN(pendingTx.current.size);
      }
      if (d.tx) setLast({ query_hint: d.query ?? null, endpoint: "text", amount: d.amount ?? "100000", network: d.network ?? "stellar:testnet" });
      tick();
    };
    window.addEventListener("almoneda:sale", onSale);
    const t = setInterval(tick, 30_000);
    return () => {
      window.removeEventListener("almoneda:sale", onSale);
      clearInterval(t);
    };
  }, []);

  const lastAmt = last
    ? last.network.startsWith("stellar")
      ? `${(parseInt(last.amount, 10) / 1e7).toFixed(2)} XLM`
      : `$${(parseInt(last.amount, 10) / 1e6).toFixed(2)}`
    : null;

  return (
    <>
      <span>
        <b>{total + pendingN}</b> lots sold
      </span>
      {last && (
        <span className="hammer">
          last hammer — <b>“{last.query_hint || last.endpoint}”</b> · {lastAmt}
        </span>
      )}
    </>
  );
}
