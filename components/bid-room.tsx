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
  provenance?: { museum?: string; accession: string | null; rights: string; verified: boolean; evidence_url?: string | null };
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

// Haptics are a bonus layer — devices without support just don't feel it,
// and the visitor can switch them off for good from the console footnote.
let haptics: WebHaptics | null = null;
let hapticsOn = true;
const buzz = (preset: string) => {
  try {
    if (!hapticsOn || !WebHaptics.isSupported) return;
    (haptics ??= new WebHaptics()).trigger(preset);
  } catch {}
};

// The gavel strike's sound — a synthesized knock (noise burst over a falling
// sine), tied to the same opt-out as haptics. The AudioContext unlocks on the
// visitor's click, so the strike lands when settlement actually does.
let actx: AudioContext | null = null;
// The context must be created inside the click — settlement lands seconds
// later, after transient activation has expired, and a context born in a
// timer stays suspended forever.
const wakeAudio = () => {
  try {
    if (!hapticsOn) return;
    actx ??= new AudioContext();
    if (actx.state === "suspended") void actx.resume();
  } catch {}
};
const knock = () => {
  try {
    if (!hapticsOn || !actx || actx.state !== "running") return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const og = actx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(og).connect(actx.destination);
    osc.start(t); osc.stop(t + 0.18);
    const nb = actx.createBuffer(1, actx.sampleRate * 0.04, actx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const ns = actx.createBufferSource();
    const ng = actx.createGain();
    const nf = actx.createBiquadFilter();
    nf.type = "bandpass"; nf.frequency.value = 2600; nf.Q.value = 0.8;
    ng.gain.setValueAtTime(0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    ns.buffer = nb;
    ns.connect(nf).connect(ng).connect(actx.destination);
    ns.start(t);
  } catch {}
};

// The signature moment: an auction gavel swings down onto the winning lot at
// the exact moment the facilitator confirms settlement — then the SOLD stamp
// presses on and the receipt prints. Reduced-motion gets the stamp only.
function GavelStrike({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      className="gavel-overlay"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-hidden="true"
    >
      <motion.svg
        viewBox="0 0 96 96"
        className="gavel"
        initial={{ rotate: -52, y: -26, opacity: 0 }}
        animate={{ rotate: [-52, -52, 0, -7, 0], y: [-26, -26, 0, -4, 0], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: 0.9, times: [0, 0.28, 0.52, 0.68, 1], ease: ["easeOut", "easeIn", "easeOut", "easeIn"] }}
        onAnimationComplete={onDone}
      >
        {/* head */}
        <rect x="14" y="8" width="44" height="18" rx="3" fill="var(--ink)" />
        <rect x="18" y="12" width="36" height="10" rx="2" fill="var(--sold)" />
        {/* handle */}
        <rect x="50" y="24" width="8" height="52" rx="3" fill="var(--ink)" transform="rotate(28 54 24)" />
      </motion.svg>
    </motion.div>
  );
}

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

const LotCard = ({ l, sold, slam }: { l: Lot; sold?: boolean; slam?: boolean }) => {
  const [failed, setFailed] = useState(false);
  const [gavelGone, setGavelGone] = useState(false);
  const link = l.provenance?.evidence_url;
  return (
    <div className="lot" key={l.id}>
      {sold && <div className={`stamp-sold${slam ? " slam" : ""}`}>SOLD</div>}
      {slam && !gavelGone && <GavelStrike onDone={() => setGavelGone(true)} />}
      {failed ? (
        <div className="lot-img-miss">
          the museum's CDN held this one back
          {link && (
            <>
              {" — "}
              <a href={link} target="_blank" rel="noreferrer">see the catalogue record ↗</a>
            </>
          )}
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={l.image.thumb} alt={l.title} loading="lazy" onError={() => setFailed(true)} />
      )}
      <div className="d">
        <div className="t">{l.title}</div>
        {l.artist && <div className="a">{l.artist}</div>}
        {l.provenance && (
          <div className="p">
            {l.provenance.accession ? `acc. ${l.provenance.accession} · ` : ""}
            <span className={l.provenance.verified ? "ok" : ""}>{l.provenance.verified ? `${l.provenance.rights} ✓` : `${l.provenance.rights}`}</span>
            {link && (
              <>
                {" · "}
                <a href={link} target="_blank" rel="noreferrer" style={{ color: "var(--usdc)" }}>catalogue ↗</a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function BidRoom() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"bid" | "free" | null>(null);
  const [res, setRes] = useState<BidResult | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [live, setLive] = useState(false);
  const [freeLots, setFreeLots] = useState<Lot[] | null>(null);
  const [freeNote, setFreeNote] = useState<{ text: string; err?: boolean } | null>(null);
  const [slam, setSlam] = useState(0);
  const [haptics, setHaptics] = useState(true);
  const [follow, setFollow] = useState(true);
  const tapeEnd = useRef<HTMLDivElement>(null);
  const consoleCol = useRef<HTMLElement | null>(null);

  // the haptics preference persists — stored once, honoured by every buzz
  useEffect(() => {
    const saved = localStorage.getItem("almoneda:haptics");
    if (saved === "off") {
      hapticsOn = false;
      setHaptics(false);
    }
  }, []);
  const toggleHaptics = () => {
    const next = !haptics;
    setHaptics(next);
    hapticsOn = next;
    localStorage.setItem("almoneda:haptics", next ? "on" : "off");
    if (next) buzz("selection");
  };

  // The wire grows downward and the console follows it — until the visitor
  // scrolls up to inspect. Then a "follow latest" pill takes over; the tape
  // never yanks the reader back.
  useEffect(() => {
    const el = tapeEnd.current;
    consoleCol.current = (el?.closest(".console-col") as HTMLElement | null) ?? null;
    const col = consoleCol.current;
    const onScroll = () => {
      if (!col) return;
      const nearBottom = col.scrollHeight - col.scrollTop - col.clientHeight < 48;
      setFollow(nearBottom);
    };
    col?.addEventListener("scroll", onScroll, { passive: true });
    // on mobile the page itself is the scroller: if the visitor scrolls and
    // the tape end leaves the viewport, they are inspecting — stop following
    const onWin = () => {
      if (col && col.scrollHeight > col.clientHeight) return;
      const r = tapeEnd.current?.getBoundingClientRect();
      if (r && (r.top > innerHeight || r.bottom < 0)) setFollow(false);
    };
    window.addEventListener("scroll", onWin, { passive: true });
    return () => {
      col?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onWin);
    };
  }, []);

  useEffect(() => {
    if (!follow) return;
    if (!steps.length && !res && !freeNote && !freeLots?.length) return;
    const el = tapeEnd.current;
    const col = consoleCol.current;
    if (col && col.scrollHeight > col.clientHeight) col.scrollTop = col.scrollHeight;
    else el?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [steps, res, freeNote, freeLots, follow]);

  const bid = async () => {
    buzz("medium");
    wakeAudio();
    setBusy("bid");
    setRes(null);
    setSteps([]);
    setLive(false);
    setFreeLots(null);
    setFreeNote(null);
    setFollow(true);
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
                // the gavel falls when the facilitator confirms — impact at
                // ~470ms into the swing, then the floor learns the tx
                setSlam((s) => s + 1);
                setTimeout(() => { buzz("heavy"); knock(); }, 470);
                setTimeout(() => buzz("success"), 900);
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
        // the wire can still go quiet before the result line — say so plainly
        setRes((r) => r ?? { error: "wire_dropped", message: "the wire went quiet before the hammer fell — retry in a moment" });
      } else {
        const j: BidResult = await r.json().catch(() => ({ error: "bid_failed", message: `HTTP ${r.status}` }));
        setRes(j);
        if (j.error) buzz("error");
      }
    } catch (e: any) {
      buzz("error");
      setRes({ error: "bid_failed", message: "the wire dropped mid-call — retry in a moment" });
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
    setFollow(true);
    try {
      const u = new URL("/v1/demo/search", location.origin);
      u.searchParams.set("q", q.trim() || "a quiet interior");
      u.searchParams.set("n", "4");
      const r = await fetch(u.toString());
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        buzz("error");
        setFreeNote({ text: j?.message ?? `preview failed (${r.status}) — the paid desk is always open`, err: true });
      } else {
        buzz("selection");
        setFreeLots(j?.results ?? []);
        setFreeNote({ text: "unpaid preview — three a day. The paid desk sells these for a cent each." });
      }
    } catch {
      buzz("error");
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
        <p className="console-lede">
          House-funded testnet demonstration — the purse pays, no wallet needed. Three bids a day.
          Your agent buys the search itself: the works it wins appear below, and the sale lands on the floor.
        </p>
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
            <button
              key={c}
              type="button"
              className={q === c ? "sel" : ""}
              aria-pressed={q === c}
              onClick={() => { buzz("selection"); setQ(c); }}
            >
              {c}
            </button>
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
          The agent buys <b>one API response</b>, not exclusive ownership — the works are public domain for
          everyone.{" "}
          <button type="button" className="hapt" onClick={toggleHaptics} aria-pressed={haptics}>
            haptics {haptics ? "on" : "off"}
          </button>
        </p>

        <AnimatePresence>
          {res?.settlement && res.explorer_url && (
            <motion.div
              className="settle-pin"
              role="status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className="sp-stamp">sold</span>
              <span>
                settled on {res.settlement.network} —{" "}
                <a href={res.explorer_url} target="_blank" rel="noreferrer">
                  {res.settlement.transaction.slice(0, 14)}… ↗
                </a>
                {res.lots?.[0] ? <> · won “{res.lots[0].title}”{res.lots.length > 1 ? ` +${res.lots.length - 1}` : ""}</> : null}
                {" "}· the new row is open on the floor →
              </span>
            </motion.div>
          )}
        </AnimatePresence>

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
            {freeNote && (
              <div className={`ln ${freeNote.err ? "err" : ""}`}>
                <span className="k">—</span>
                <span style={{ color: freeNote.err ? "var(--sold)" : "var(--ink-3)" }}>{freeNote.text}</span>
              </div>
            )}
            {!follow && (
              <button
                type="button"
                className="followbtn"
                onClick={() => {
                  setFollow(true);
                  const col = consoleCol.current;
                  if (col) col.scrollTop = col.scrollHeight;
                  else tapeEnd.current?.scrollIntoView({ block: "nearest" });
                }}
              >
                ↓ follow the wire
              </button>
            )}
          </div>
        )}
        </div>

        {res?.lots && done && (
          <motion.div className={`results${slam ? " shook" : ""}`} key={`r${slam}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            {res.lots.map((l, i) => <LotCard l={l} sold={i === 0} slam={i === 0 && slam > 0} key={l.id} />)}
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
