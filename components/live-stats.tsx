"use client";

import { useEffect, useState } from "react";

type Last = { query_hint: string | null; endpoint: string; amount: string; network: string };

// The statbar is server-rendered, but the floor counts move the moment a
// settlement lands. Listen for the console's sale event and pull /v1/floor so
// every number on the page agrees with the ledger — nothing teleports.
export default function LiveStats({ initialTotal, initialLast }: { initialTotal: number; initialLast: Last | null }) {
  const [total, setTotal] = useState(initialTotal);
  const [last, setLast] = useState<Last | null>(initialLast);

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        if (typeof j?.sales?.total === "number") setTotal(j.sales.total);
        const n = j?.sales?.recent?.[0];
        if (n) setLast({ query_hint: n.query_hint, endpoint: n.endpoint, amount: n.amount, network: n.network });
      } catch {}
    };
    const onSale = () => tick();
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
        <b>{total}</b> lots sold
      </span>
      {last && (
        <span className="hammer">
          last hammer — <b>“{last.query_hint || last.endpoint}”</b> · {lastAmt}
        </span>
      )}
    </>
  );
}
