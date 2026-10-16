"use client";

import { useEffect, useState } from "react";
import { inspect } from "@/components/lot-inspector";

type Lot = {
  id: number;
  tx?: string;
  network: string;
  amount: string;
  created_at: string;
  lot_title?: string | null;
  lot_artist?: string | null;
  lot_museum?: string | null;
  lot_rights?: string | null;
  lot_date?: string | null;
  lot_medium?: string | null;
  lot_img?: string | null;
  lot_url?: string | null;
};

const railAmt = (s: Lot) =>
  s.network?.startsWith("stellar") ? `${(parseInt(s.amount, 10) / 1e7).toFixed(2)} XLM` : `$${(parseInt(s.amount, 10) / 1e6).toFixed(2)}`;
const explorer = (s: Lot) =>
  s.network?.startsWith("stellar") ? `https://stellar.expert/explorer/testnet/tx/${s.tx}` : `https://sepolia.basescan.org/tx/${s.tx}`;
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function Ago({ iso }: { iso: string }) {
  const [rel, setRel] = useState<string | null>(null);
  useEffect(() => setRel(ago(iso)), [iso]);
  if (rel) return <>{rel}</>;
  return <>{new Date(iso).toISOString().slice(11, 19)}Z</>;
}

// The latest settled lot, rendered as a button — the whole card opens the
// inspector. `listen` makes it follow almoneda:sale events itself (used by
// the mobile hero, which lives outside the ledger's state).
export default function LastLot({ sale, listen }: { sale: Lot | null; listen?: boolean }) {
  const [s, setS] = useState(sale);
  useEffect(() => setS(sale), [sale]);

  useEffect(() => {
    if (!listen) return;
    const on = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        const n = j?.sales?.recent?.[0];
        if (n) setS(n);
      } catch {}
    };
    window.addEventListener("almoneda:sale", on);
    return () => window.removeEventListener("almoneda:sale", on);
  }, [listen]);

  if (!s?.lot_img) return null;
  return (
    <button
      type="button"
      className="lastlot"
      onClick={() =>
        inspect({
          title: s.lot_title ?? "Untitled",
          artist: s.lot_artist,
          museum: s.lot_museum,
          rights: s.lot_rights,
          date: s.lot_date,
          medium: s.lot_medium,
          img: s.lot_img,
          evidence_url: s.lot_url,
          hammer: railAmt(s),
          tx: s.tx,
          explorer_url: s.tx ? explorer(s) : null,
        })
      }
      aria-label={`inspect ${s.lot_title ?? "the last lot"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.lot_img} alt={s.lot_title ?? ""} loading="lazy" />
      <div className="ll-meta">
        <span className="ll-tag">lot №{s.id} · last through the door</span>
        <span className="ll-t">{s.lot_title ?? "Untitled"}</span>
        {s.lot_artist && <span className="ll-a">{s.lot_artist}</span>}
        {s.lot_museum && <span className="ll-m">{s.lot_museum}</span>}
      </div>
      <div className="ll-sold">
        sold <Ago iso={s.created_at} /> · <b>{railAmt(s)}</b>
        {s.tx ? (
          <>
            {" "}·{" "}
            <a href={explorer(s)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {short(s.tx)} ↗
            </a>
          </>
        ) : null}
        <span className="ll-cue">inspect →</span>
      </div>
    </button>
  );
}
