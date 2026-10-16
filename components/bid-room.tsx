"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { WebHaptics } from "web-haptics";

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

const CHIPS = ["a storm at sea", "gold and grief", "a sleeping child", "winter light"];

// Haptics are a bonus layer — devices without support just don't feel it.
let haptics: WebHaptics | null = null;
const buzz = (preset: string) => {
  try {
    if (!WebHaptics.isSupported) return;
    (haptics ??= new WebHaptics()).trigger(preset);
  } catch {}
};

const tapeLine = (s: Step, i: number) => {
  const cls = i === 0 ? "" : i === 1 || i === 2 ? "pay" : "ok";
  return (
    <div className={`ln ${cls}`} key={i}>
      <span className="k">{(s.ms / 1000).toFixed(1)}s</span>
      <span>
        {s.step} <span style={{ color: "var(--ink-3)" }}>{s.detail}</span>
      </span>
    </div>
  );
};

const LotCard = ({ l, sold }: { l: Lot; sold?: boolean }) => (
  <div className="lot" key={l.id}>
    {sold && <div className="stamp-sold">SOLD</div>}
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
);

export default function BidRoom() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"bid" | "free" | null>(null);
  const [res, setRes] = useState<BidResult | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [live, setLive] = useState(false);
  const [freeLots, setFreeLots] = useState<Lot[] | null>(null);
  const [freeNote, setFreeNote] = useState<{ text: string; err?: boolean } | null>(null);
  const tapeEnd = useRef<HTMLDivElement>(null);

  // the wire grows downward — keep the newest line in view so the payoff
  // is never below the fold of the console's internal scroll
  useEffect(() => {
    tapeEnd.current?.scrollIntoView({ block: "nearest" });
  }, [steps, res, freeNote, freeLots]);

  const bid = async () => {
    buzz("medium");
    setBusy("bid");
    setRes(null);
    setSteps([]);
    setLive(false);
    setFreeLots(null);
    setFreeNote(null);
    try {
      const r = await fetch("/v1/demo/bid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: q.trim() }),
      });
      // the tape is a live NDJSON wire — lines land when the protocol
      // event actually happens, not on a replay timer
      if (r.ok && (r.headers.get("content-type") || "").includes("ndjson") && r.body) {
        setLive(true);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const handle = (line: string) => {
          if (!line.trim()) return;
          try {
            const m = JSON.parse(line);
            if (m.type === "step") setSteps((s) => [...s, { step: m.step, detail: m.detail, ms: m.ms }]);
            else if (m.type === "result") {
              setRes(m);
              if (m.settlement?.transaction) {
                buzz("success");
                setTimeout(() => window.dispatchEvent(new CustomEvent("almoneda:sale", { detail: { tx: m.settlement.transaction } })), 1600);
              }
            } else if (m.type === "error") {
              buzz("error");
              setRes({ error: m.error, message: m.message ?? `HTTP ${m.status ?? ""}` });
            }
          } catch {}
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) handle(line);
        }
        handle(buf); // last line may arrive unterminated
        setLive(false);
      } else {
        const j: BidResult = await r.json().catch(() => ({ error: "bid_failed", message: `HTTP ${r.status}` }));
        setRes(j);
        if (j.error) buzz("error");
      }
    } catch (e: any) {
      buzz("error");
      setRes({ error: "bid_failed", message: e?.message ?? "network error" });
    } finally {
      setBusy(null);
      setLive(false);
    }
  };

  const free = async () => {
    setBusy("free");
    setRes(null);
    setFreeLots(null);
    setFreeNote(null);
    try {
      const u = new URL("/v1/demo/search", location.origin);
      u.searchParams.set("q", q.trim() || "a quiet interior");
      u.searchParams.set("n", "4");
      const r = await fetch(u.toString());
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setFreeNote({ text: j?.message ?? `preview failed (${r.status}) — the paid desk is always open`, err: true });
      } else {
        setFreeLots(j?.results ?? []);
        setFreeNote({ text: "unpaid preview — three a day. The paid desk sells these for a cent each." });
      }
    } catch {
      setFreeNote({ text: "preview failed — try again", err: true });
    } finally {
      setBusy(null);
    }
  };

  const done = res && !res.error;

  return (
    <MotionConfig reducedMotion="user">
    <div className="console">
      <div className="hd">
        <span>the bidding console</span>
        <span>x402 · testnet</span>
      </div>
      <div className="bd">
        <label className="f-label" htmlFor="bid-query">what your agent needs</label>
        <input
          type="text"
          id="bid-query"
          name="query"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && bid()}
          placeholder='describe the work — e.g. "a storm at sea"'
          aria-label="search query"
        />
        <div className="chips" aria-label="example queries">
          {CHIPS.map((c) => (
            <button key={c} type="button" onClick={() => { buzz("selection"); setQ(c); }}>{c}</button>
          ))}
        </div>
        <div className="actions">
          <button className={`btn${busy === "bid" ? " busy" : ""}`} onClick={bid} disabled={!!busy}>
            send an agent to bid — $0.01
          </button>
          <button className={`btn ghost${busy === "free" ? " busy" : ""}`} onClick={free} disabled={!!busy}>
            browse free
          </button>
        </div>
        <p className="fineprint">
          Fixed-price sale: <b>testnet money</b>, no wallet needed — the house purse pays so you can watch a real
          x402 payment settle on-chain. The agent buys <b>one API response</b>, not exclusive ownership: the works
          are public domain for everyone.
        </p>

        <div aria-live="polite">
        {(steps.length > 0 || res || freeLots || freeNote) && (
          <div className="tape">
            {steps.map(tapeLine)}
            {live && <div className="ln"><span className="k">···</span><span className="wire">on the wire</span></div>}
            {res?.error && (
              <div className="ln err">
                <span className="k">—</span>
                <span>{res.message ?? res.error}</span>
              </div>
            )}
            {(res?.error === "demo_quota" || res?.error === "purse_empty") && (
              <div className="ln">
                <span className="k">→</span>
                <span>
                  <button
                    type="button"
                    className="replaybtn"
                    onClick={() => window.dispatchEvent(new CustomEvent("almoneda:open-latest"))}
                  >
                    replay the last settlement on the floor
                  </button>
                </span>
              </div>
            )}
            <AnimatePresence>
              {res?.settlement && res.explorer_url && (
                <motion.div className="ln ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <span className="k">sold</span>
                  <span>
                    settled on {res.settlement.network} —{" "}
                    <a href={res.explorer_url} target="_blank" rel="noreferrer" style={{ color: "var(--usdc)" }}>
                      {res.settlement.transaction.slice(0, 14)}… ↗
                    </a>
                    {" "}· the new row lands on the floor →
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {freeNote && (
              <div className={`ln ${freeNote.err ? "err" : ""}`}>
                <span className="k">—</span>
                <span style={{ color: freeNote.err ? "var(--sold)" : "var(--ink-3)" }}>{freeNote.text}</span>
              </div>
            )}
          </div>
        )}
        </div>

        {res?.lots && done && (
          <motion.div className="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            {res.lots.map((l, i) => <LotCard l={l} sold={i === 0} key={l.id} />)}
          </motion.div>
        )}

        {freeLots && freeLots.length > 0 && (
          <motion.div className="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            {freeLots.map((l) => <LotCard l={l} key={l.id} />)}
          </motion.div>
        )}
        <div ref={tapeEnd} />
      </div>
    </div>
    </MotionConfig>
  );
}
