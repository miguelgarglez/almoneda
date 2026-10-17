"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { WebHaptics } from "web-haptics";
import { inspect } from "@/components/lot-inspector";

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

// The signature moment: an auction gavel swings down onto the winning lot's
// edge — the house seal it strikes — the moment the facilitator confirms
// settlement, then the SOLD stamp presses on. Reduced-motion gets the stamp.
function GavelStrike({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      className="gavel-overlay"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-hidden="true"
    >
      <span className="impact-seal" />
      <span className="impact-ring" />
      <motion.svg
        viewBox="0 0 96 96"
        className="gavel"
        initial={{ rotate: -48, y: -22, opacity: 0 }}
        animate={{ rotate: [-48, -48, 0, -4, 0], y: [-22, -22, 0, -3, 0], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: 0.9, times: [0, 0.28, 0.52, 0.68, 1], ease: ["easeOut", "easeIn", "easeOut", "easeIn"] }}
        onAnimationComplete={onDone}
      >
        {/* a clerk's desk gavel — turned walnut with brass bands, drawn with
            the same restraint as the catalogue type around it */}
        <defs>
          <linearGradient id="gv-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a4636" />
            <stop offset="0.42" stopColor="#23241c" />
            <stop offset="1" stopColor="#12140e" />
          </linearGradient>
          <linearGradient id="gv-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d4b05c" />
            <stop offset="0.5" stopColor="#9c7c33" />
            <stop offset="1" stopColor="#63501f" />
          </linearGradient>
        </defs>
        <g transform="rotate(24 44 30)">
          <rect x="14" y="14" width="60" height="22" rx="4" fill="url(#gv-wood)" />
          <rect x="10" y="11" width="12" height="28" rx="5" fill="url(#gv-wood)" />
          <rect x="66" y="11" width="12" height="28" rx="5" fill="url(#gv-wood)" />
          <rect x="22" y="14" width="6" height="22" fill="url(#gv-band)" />
          <rect x="60" y="14" width="6" height="22" fill="url(#gv-band)" />
          <rect x="38" y="34" width="12" height="56" rx="5" fill="url(#gv-wood)" />
          <rect x="38" y="34" width="3" height="56" rx="1.5" fill="#5a5644" opacity="0.55" />
        </g>
      </motion.svg>
    </motion.div>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  return (
    <button
      type="button"
      className="copybtn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
        } catch {
          setState("err");
        }
        setTimeout(() => setState("idle"), 1200);
      }}
    >
      {state === "ok" ? "copied" : state === "err" ? "failed" : label}
    </button>
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

// One plain-language stage for the whole settlement arc — the NDJSON tape
// stays as the record underneath, but the visitor watches a status, not a log.
const stageOf = (steps: Step[]) => {
  const last = steps[steps.length - 1]?.step ?? "";
  const retried = steps.slice(0, -1).some((s) => /hiccup/.test(s.step));
  if (/delivered|recovered/.test(last)) return "sold — the lot is on its way to the floor";
  if (/settled/.test(last)) return "the hammer fell — settling";
  if (/hiccup/.test(last)) return "the rail hiccuped — the house runs the bid again";
  const phase = /PAYMENT-SIGNATURE/.test(last)
    ? "awaiting settlement"
    : /signing/.test(last)
      ? "the agent signs the bid"
      : /402/.test(last)
        ? "the house named its price"
        : "asking the house";
  // after a hiccup the tape cycles through the early steps again — keep the
  // visitor oriented: it's the same bid, second attempt
  return retried ? `second attempt — ${phase}` : phase;
};

const LotCard = ({ l, sold, slam, n }: { l: Lot; sold?: boolean; slam?: boolean; n?: number }) => {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [gavelGone, setGavelGone] = useState(false);
  const link = l.provenance?.evidence_url;
  return (
    <div className="lot" key={l.id}>
      {n != null && <span className="lotno">lot {String(n).padStart(2, "0")}</span>}
      {sold && <div className={`stamp-sold${slam ? " slam" : ""}`}>SOLD</div>}
      {/* the seal the gavel struck stays pressed on the card's edge — the
          strike leaves a mark on the catalogue object, not just a flash */}
      {sold && <span className={`lot-seal${slam ? " slam" : ""}`} aria-hidden="true" />}
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
        <button
          type="button"
          className="lot-open"
          aria-label={`inspect ${l.title}`}
          onClick={() =>
            inspect({
              title: l.title,
              artist: l.artist,
              img: l.image.display || l.image.thumb,
              accession: l.provenance?.accession,
              rights: l.provenance?.rights,
              verified: l.provenance?.verified,
              evidence_url: link,
              museum: l.provenance?.museum,
            })
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={l.image.thumb}
            alt={l.title}
            loading="lazy"
            className={loaded ? "in" : ""}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          <span className="lot-zoom" aria-hidden="true">inspect</span>
        </button>
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
  const [rowLanded, setRowLanded] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [follow, setFollow] = useState(true);
  const tapeEnd = useRef<HTMLDivElement>(null);
  const consoleCol = useRef<HTMLElement | null>(null);
  const wireStart = useRef<number>(0);
  const [now, setNow] = useState(0);

  // the stage line carries an honest elapsed clock while the wire is open
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [live]);

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

  // the pin only claims the row once the floor has actually shown it —
  // sale-shown is dispatched by the ledger itself, not on a guess timer
  useEffect(() => {
    const onShown = () => setRowLanded(true);
    window.addEventListener("almoneda:sale-shown", onShown);
    return () => window.removeEventListener("almoneda:sale-shown", onShown);
  }, []);

  useEffect(() => {
    if (!follow) return;
    if (!steps.length && !res && !freeNote && !freeLots?.length) return;
    const el = tapeEnd.current;
    const col = consoleCol.current;
    if (col && col.scrollHeight > col.clientHeight) col.scrollTop = col.scrollHeight;
    else el?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [steps, res, freeNote, freeLots, follow]);

  // the strike carries the work into the ledger: once the hammer lands, a
  // clone of the winning lot travels to the pending row's thumbnail — one
  // directed motion instead of independent celebrations on two sides
  const flyLot = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = document.querySelector<HTMLElement>(".results .lot:first-child img");
    const to = document.querySelector<HTMLElement>(".ledger tbody tr.pending .lthumb");
    if (!from || !to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const c = from.cloneNode() as HTMLElement;
    Object.assign(c.style, {
      position: "fixed", left: `${a.left}px`, top: `${a.top}px`,
      width: `${a.width}px`, height: `${a.height}px`, objectFit: "cover",
      zIndex: "90", margin: "0", pointerEvents: "none", transformOrigin: "0 0",
      boxShadow: "0 8px 24px rgba(30,32,26,0.28)", border: "1px solid var(--line-2)",
    });
    document.body.appendChild(c);
    const anim = c.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})`, opacity: 0.92 },
      ],
      { duration: 560, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)", fill: "forwards" }
    );
    anim.onfinish = () => c.remove();
  };

  const bid = async () => {
    buzz("medium");
    wakeAudio();
    window.dispatchEvent(new CustomEvent("almoneda:settling"));
    setBusy("bid");
    setRes(null);
    setSteps([]);
    setLive(false);
    setFreeLots(null);
    setFreeNote(null);
    setFollow(true);
    setRowLanded(false);
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
        wireStart.current = Date.now();
        setNow(Date.now());
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
                // one settlement event, one consequence: the pin, the
                // counters and the ledger's pending row all move on the same
                // beat; the gavel lands at ~470ms and the work then travels
                // to its public row
                window.dispatchEvent(
                  new CustomEvent("almoneda:sale", {
                    detail: {
                      tx: m.settlement.transaction,
                      network: m.settlement.network,
                      amount: m.amount ?? null,
                      query: q.trim() || null,
                      titles: (m.lots ?? []).map((l: Lot) => l.title),
                      thumb: m.lots?.[0]?.image?.thumb ?? null,
                    },
                  })
                );
                setSlam((s) => s + 1);
                setTimeout(() => { buzz("heavy"); knock(); }, 470);
                setTimeout(() => flyLot(), 720);
                setTimeout(() => buzz("success"), 900);
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
      window.dispatchEvent(new CustomEvent("almoneda:settling-end"));
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
          Try a house-funded search — the purse pays, no wallet needed.
        </p>
        <label className="f-label" htmlFor="bid-query">what your agent needs</label>
        <input
          type="text"
          id="bid-query"
          name="query"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && bid()}
          placeholder='e.g. "a storm at sea"'
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
        <details className="about">
          <summary>what the call buys · rails · haptics</summary>
          <p className="fineprint">
            One call buys <b>one paid API response</b> — artworks, provenance, and an on-chain receipt
            that lands on the floor. Not exclusive ownership: the works are public domain for everyone.
            Sticker price $0.01; the house settles it on whichever testnet rail is funded (usually
            Stellar XLM).{" "}
            <button type="button" className="hapt" onClick={toggleHaptics} aria-pressed={haptics}>
              haptics {haptics ? "on" : "off"}
            </button>
          </p>
        </details>

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
                <CopyBtn label="copy tx" text={res.settlement.transaction} />
                {res.lots?.[0] ? <> · won “{res.lots[0].title}”{res.lots.length > 1 ? ` +${res.lots.length - 1}` : ""}</> : null}
                {" "}·{" "}
                {rowLanded ? (
                  <button
                    type="button"
                    className="floorlink"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent("almoneda:open-sale", { detail: { tx: res.settlement!.transaction } }))
                    }
                  >
                    the new row is open on the floor →
                  </button>
                ) : (
                  "landing on the floor…"
                )}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div aria-live="polite">
        {(steps.length > 0 || res || freeLots || freeNote) && (
          <div className="tape">
            {live && steps.length > 0 && (
              <div className="stage" role="status">
                <span className="st-dot" aria-hidden="true" />
                <span className="st-word">{stageOf(steps)}</span>
                <span className="st-elapsed">{((now - wireStart.current) / 1000).toFixed(0)}s on the wire</span>
              </div>
            )}
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
          <>
            <div className="res-bar">
              <span className="res-tag">{res.lots.length} {res.lots.length === 1 ? "lot" : "lots"} delivered</span>
              <CopyBtn label="copy the call" text={`curl -sS "${location.origin}/v1/search?q=${encodeURIComponent(q.trim())}" -i\n# → HTTP 402, then sign and retry with PAYMENT-SIGNATURE`} />
              <CopyBtn
                label="copy what it got"
                text={JSON.stringify({ lots: res.lots, settlement: res.settlement ?? null }, null, 2)}
              />
            </div>
            <motion.div className={`results${slam ? " shook" : ""}`} key={`r${slam}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              {res.lots.map((l, i) => <LotCard l={l} sold={i === 0} slam={i === 0 && slam > 0} n={i + 1} key={l.id} />)}
            </motion.div>
          </>
        )}

        {freeLots && freeLots.length > 0 && (
          <motion.div className="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            {freeLots.map((l, i) => <LotCard l={l} n={i + 1} key={l.id} />)}
          </motion.div>
        )}
        <div ref={tapeEnd} />
      </div>
    </div>
    </MotionConfig>
  );
}
