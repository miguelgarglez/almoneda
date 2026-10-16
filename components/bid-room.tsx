"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Step = { step: string; detail: string; ms: number };
type Lot = {
  id: string;
  title: string;
  artist: string;
  image: { display: string; thumb: string };
  provenance?: { accession: string | null; rights: string; verified: boolean };
};

type BidResult = {
  agent?: { address: string; rail: string; note: string };
  settlement?: { transaction: string; network: string };
  explorer_url?: string | null;
  steps?: Step[];
  lots?: Lot[];
  error?: string;
  message?: string;
};

const tapeLine = (s: Step, i: number) => {
  const cls = i === 0 ? "" : i === 1 ? "pay" : "ok";
  return (
    <div className={`ln ${cls}`} key={i}>
      <span className="k">{(s.ms / 1000).toFixed(1)}s</span>
      <span>
        {s.step} <span style={{ color: "var(--ink-3)" }}>{s.detail}</span>
      </span>
    </div>
  );
};

export default function BidRoom() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"bid" | "free" | null>(null);
  const [res, setRes] = useState<BidResult | null>(null);
  const [shownSteps, setShownSteps] = useState(0);
  const [freeLots, setFreeLots] = useState<Lot[] | null>(null);
  const [freeNote, setFreeNote] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stagger = (n: number) => {
    setShownSteps(0);
    timers.current.forEach(clearTimeout);
    timers.current = Array.from({ length: n }, (_, i) => setTimeout(() => setShownSteps(i + 1), 350 + i * 650));
  };

  const bid = async () => {
    setBusy("bid");
    setRes(null);
    setFreeLots(null);
    try {
      const r = await fetch("/v1/demo/bid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: q.trim() }),
      });
      const j: BidResult = await r.json();
      setRes(j);
      stagger((j.steps?.length ?? 0) + (j.explorer_url ? 1 : 0) + 1);
    } catch (e: any) {
      setRes({ error: "bid_failed", message: e?.message ?? "network error" });
    } finally {
      setBusy(null);
    }
  };

  const free = async () => {
    setBusy("free");
    setRes(null);
    setFreeLots(null);
    try {
      const u = new URL("/v1/demo/search", location.origin);
      u.searchParams.set("q", q.trim() || "a quiet interior");
      u.searchParams.set("n", "4");
      const r = await fetch(u.toString());
      const j = await r.json();
      if (r.status === 429) setFreeNote(j.message ?? "Free quota spent for today.");
      else {
        setFreeLots(j.results ?? []);
        setFreeNote(`unpaid preview — ${j?.demo?.free_calls_left_today ?? "?"} free calls left today`);
      }
    } catch {
      setFreeNote("preview failed — try again");
    } finally {
      setBusy(null);
    }
  };

  const done = res && res.steps && shownSteps > res.steps.length;

  return (
    <div className="console">
      <div className="hd">
        <span>the bidding console</span>
        <span>x402 · usdc / xlm</span>
      </div>
      <div className="bd">
        <input
          type="text"
          id="bid-query"
          name="query"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && bid()}
          placeholder='describe the work your agent needs — "a storm at sea", "gold and grief"…'
          aria-label="search query"
        />
        <div className="actions">
          <button className="btn" onClick={bid} disabled={!!busy}>
            {busy === "bid" ? "the agent is bidding…" : "send an agent to bid — $0.01"}
          </button>
          <button className="btn ghost" onClick={free} disabled={!!busy}>
            {busy === "free" ? "looking…" : "browse free"}
          </button>
        </div>
        <p className="fineprint">
          The bid button dispatches a real agent with a testnet purse: it receives an HTTP 402, signs the payment, and settles
          on-chain before the lots fall. Humans watch; machines do the paying.
        </p>

        {(res || freeLots) && (
          <div className="tape">
            {res?.error && (
              <div className="ln err">
                <span className="k">—</span>
                <span>{res.message ?? res.error}</span>
              </div>
            )}
            {res?.steps?.slice(0, shownSteps).map(tapeLine)}
            <AnimatePresence>
              {res?.settlement && res.explorer_url && shownSteps > (res.steps?.length ?? 0) && (
                <motion.div className="ln ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <span className="k">sold</span>
                  <span>
                    settled on {res.settlement.network} —{" "}
                    <a href={res.explorer_url} target="_blank" rel="noreferrer" style={{ color: "var(--usdc)" }}>
                      {res.settlement.transaction.slice(0, 14)}… ↗
                    </a>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {freeLots && (
              <div className="ln">
                <span className="k">—</span>
                <span style={{ color: "var(--ink-3)" }}>{freeNote}</span>
              </div>
            )}
          </div>
        )}

        {res?.lots && done && (
          <motion.div className="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            {res.lots.map((l, i) => (
              <div className="lot" key={l.id}>
                {i === 0 && <div className="stamp-sold">SOLD</div>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.image.thumb} alt={l.title} loading="lazy" />
                <div className="d">
                  <div className="t">{l.title}</div>
                  {l.artist && <div className="a">{l.artist}</div>}
                  {l.provenance && (
                    <div className="p">
                      {l.provenance.accession ? `acc. ${l.provenance.accession} · ` : ""}
                      <span className={l.provenance.verified ? "ok" : ""}>{l.provenance.verified ? `${l.provenance.rights} ✓` : `${l.provenance.rights}`}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {freeLots && freeLots.length > 0 && (
          <motion.div className="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            {freeLots.map((l) => (
              <div className="lot" key={l.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.image.thumb} alt={l.title} loading="lazy" />
                <div className="d">
                  <div className="t">{l.title}</div>
                  {l.artist && <div className="a">{l.artist}</div>}
                  {l.provenance && (
                    <div className="p">
                      {l.provenance.accession ? `acc. ${l.provenance.accession} · ` : ""}
                      <span className={l.provenance.verified ? "ok" : ""}>{l.provenance.verified ? `${l.provenance.rights} ✓` : `${l.provenance.rights}`}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
