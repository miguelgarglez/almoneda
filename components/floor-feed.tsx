"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import "number-flow";

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "number-flow": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      }
    }
  }
}

type SaleLotRef = { title: string; object_url: string | null };

type Sale = {
  id: number;
  payer: string;
  tx: string;
  network: string;
  amount: string;
  endpoint: string;
  query_hint: string;
  artwork_ids?: string[];
  thumb?: string | null;
  lot_title?: string | null;
  lot_url?: string | null;
  lot_img?: string | null;
  lot_artist?: string | null;
  lot_museum?: string | null;
  lots?: SaleLotRef[];
  latency_ms?: number | null;
  created_at: string;
};

const railName = (n: string) => (n.startsWith("stellar") ? "XLM" : n.includes("84532") ? "USDC" : n);
const railAmt = (s: Sale) =>
  s.network.startsWith("stellar") ? `${(parseInt(s.amount, 10) / 1e7).toFixed(2)} XLM` : `$${(parseInt(s.amount, 10) / 1e6).toFixed(2)}`;
const explorer = (s: Sale) =>
  s.network.startsWith("stellar") ? `https://stellar.expert/explorer/testnet/tx/${s.tx}` : `https://sepolia.basescan.org/tx/${s.tx}`;
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const reducedNow = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const smooth = () => (reducedNow() ? "auto" : "smooth") as ScrollBehavior;

// Digits morph place-value by place-value instead of a numeric crossfade.
// number-flow's `value` is a property, not an attribute — the element is
// driven through .update() once mounted; SSR and pre-mount render plain text
// so the count is never absent.
function Count({ value }: { value: number }) {
  const ref = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", on);
    setMounted(true);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (mounted && ref.current) ref.current.update(value);
  }, [mounted, value]);
  return (
    <span role="text" aria-label={String(value)}>
      {mounted && !reduce ? (
        <number-flow ref={ref} aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{value}</span>
      )}
    </span>
  );
}

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Relative time only exists client-side; SSR renders the UTC timestamp.
function Ago({ iso }: { iso: string }) {
  const [rel, setRel] = useState<string | null>(null);
  useEffect(() => setRel(ago(iso)), [iso]);
  if (rel) return <>{rel}</>;
  return <>{new Date(iso).toISOString().slice(11, 19)}Z</>;
}

function Copy({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  return (
    <button
      type="button"
      className="copybtn"
      aria-live="polite"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
        } catch {
          setState("err");
        }
        setTimeout(() => setState("idle"), 1200);
      }}
    >
      {state === "ok" ? "copied" : state === "err" ? "failed" : "copy"}
    </button>
  );
}

// One receipt, shared by the table's detail row and the mobile card —
// it replays the settlement from the recorded fields and names every
// delivered work, not just the first.
function SaleDetail({ s }: { s: Sale }) {
  const lots = s.lots?.length ? s.lots : s.lot_title ? [{ title: s.lot_title, object_url: s.lot_url ?? null }] : [];
  return (
    <>
      <div className="replay">
        <span className="rlab">receipt replay</span>
        <div className="rl" style={{ animationDelay: "0.1s" }}>agent asked for “{s.query_hint || s.endpoint}”</div>
        <div className="rl" style={{ animationDelay: "0.55s" }}>the desk answered 402 — payment required</div>
        <div className="rl" style={{ animationDelay: "1.0s" }}>paddle {short(s.payer)} signed · paid {railAmt(s)}</div>
        <div className="rl" style={{ animationDelay: "1.45s" }}>settled on {s.network}{s.tx ? ` — tx ${short(s.tx)}` : ""}</div>
        <div className="rl" style={{ animationDelay: "1.9s" }}>delivered{s.latency_ms != null ? ` in ${(s.latency_ms / 1000).toFixed(1)}s` : ""}{s.artwork_ids?.length ? ` · ${s.artwork_ids.length} lot${s.artwork_ids.length === 1 ? "" : "s"}` : ""}</div>
      </div>
      <div className="sale-detail">
        <div className="cell">
          <span className="lab">{lots.length === 1 ? "lot won" : `lots won · ${lots.length}`}</span>
          <span>
            {lots.length
              ? lots.map((l, i) => (
                  <Fragment key={i}>
                    {l.object_url ? (
                      <a href={l.object_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        {l.title} ↗
                      </a>
                    ) : (
                      l.title
                    )}
                    {i < lots.length - 1 ? <br /> : null}
                  </Fragment>
                ))
              : "—"}
          </span>
        </div>
        <div className="cell">
          <span className="lab">request</span>
          <span>{s.query_hint || s.endpoint}</span>
        </div>
        <div className="cell">
          <span className="lab">paddle (payer)</span>
          <span className="mono">{short(s.payer)}<Copy text={s.payer} /></span>
        </div>
        <div className="cell">
          <span className="lab">settlement</span>
          <span className="mono">
            {s.tx ? (
              <>
                <a href={explorer(s)} target="_blank" rel="noreferrer">{short(s.tx)} ↗</a>
                <Copy text={s.tx} />
              </>
            ) : "—"}
          </span>
        </div>
        {s.latency_ms != null && (
          <div className="cell">
            <span className="lab">call took</span>
            <span className="mono">{(s.latency_ms / 1000).toFixed(1)}s</span>
          </div>
        )}
        <div className="cell">
          <span className="lab">hammer fell</span>
          <span className="mono">{new Date(s.created_at).toISOString().slice(0, 19).replace("T", " ")}Z</span>
        </div>
      </div>
    </>
  );
}

const INITIAL_ROWS = 8;
const rowKey = (e: React.KeyboardEvent, toggle: () => void) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggle();
  }
};

export default function FloorFeed({ initial, total, corpusDown }: { initial: Sale[]; total: number; corpusDown?: boolean }) {
  const [sales, setSales] = useState(initial);
  const [count, setCount] = useState(total);
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [flashTx, setFlashTx] = useState<string | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        if (Array.isArray(j?.sales?.recent)) {
          setSales(j.sales.recent);
          setCount(j.sales.total ?? 0);
          setLive(true);
        }
      } catch {
        setLive(false);
      }
    };
    // the bidding console announces its settlement so the new row lands
    // immediately instead of waiting for the next poll
    const onSale = () => tick();
    window.addEventListener("almoneda:sale", onSale);
    const t = setInterval(tick, 15_000);
    return () => {
      window.removeEventListener("almoneda:sale", onSale);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    // flash the row matching the console's settlement once it appears —
    // and tell the console the consequence it promised actually landed
    if (!flashTx) return;
    const row = sales.find((s) => s.tx === flashTx);
    if (row) {
      setOpen(row.id);
      window.dispatchEvent(new CustomEvent("almoneda:sale-shown", { detail: { tx: flashTx } }));
    }
    const t = setTimeout(() => setFlashTx(null), 8000);
    return () => clearTimeout(t);
  }, [sales, flashTx]);

  useEffect(() => {
    const onSale = (e: Event) => setFlashTx((e as CustomEvent).detail?.tx ?? null);
    window.addEventListener("almoneda:sale", onSale);
    return () => window.removeEventListener("almoneda:sale", onSale);
  }, []);

  useEffect(() => {
    // quota-blocked visitors get a real replay path: the console can ask the
    // floor to open the most recent sale's receipt
    const onOpenLatest = () => {
      if (sales[0]) setOpen(sales[0].id);
      document.getElementById("floor")?.scrollIntoView({ behavior: smooth(), block: "nearest" });
    };
    window.addEventListener("almoneda:open-latest", onOpenLatest);
    return () => window.removeEventListener("almoneda:open-latest", onOpenLatest);
  }, [sales]);

  const newest = sales[0];
  const visible = showAll ? sales : sales.slice(0, INITIAL_ROWS);
  const toggle = (id: number) => setOpen((o) => (o === id ? null : id));

  return (
    <MotionConfig reducedMotion="user">
    <section className="floor" id="floor">
      <h2>
        The floor · <Count value={count} /> {count === 1 ? "lot" : "lots"} sold
      </h2>
      <p className="sub">
        <span className={`dot ${live ? "on" : ""}`} style={{ display: "inline-block", marginRight: 8 }} />
        Every row is a settled on-chain payment — click one to open the catalogue entry. Testnet money, real protocol.
      </p>

      {newest?.lot_img && (
        <div className="lastlot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={newest.lot_img} alt={newest.lot_title ?? ""} loading="lazy" />
          <div className="ll-meta">
            <span className="ll-tag">last lot through the door</span>
            <span className="ll-t">{newest.lot_title ?? "Untitled"}</span>
            {newest.lot_artist && <span className="ll-a">{newest.lot_artist}</span>}
          </div>
          <div className="ll-sold">
            sold <Ago iso={newest.created_at} /> · <b>{railAmt(newest)}</b>
            {newest.tx ? (
              <>
                {" "}·{" "}
                <a href={explorer(newest)} target="_blank" rel="noreferrer">
                  {short(newest.tx)} ↗
                </a>
              </>
            ) : null}
          </div>
        </div>
      )}

      {sales.length === 0 ? (
        <div className="empty">
          {corpusDown || !live ? (
            <>
              The floor is unreachable right now — the catalogue desk did not answer.{" "}
              <a href="/v1/status" style={{ color: "var(--usdc)" }}>check /v1/status</a>{" "}
              or{" "}
              <a href="/" style={{ color: "var(--usdc)" }}>reload the page</a>.
            </>
          ) : (
            "The gavel has not fallen yet. Send an agent to bid above — its settlement will appear here."
          )}
        </div>
      ) : (
        <>
          {/* desktop + tablet: the ledger table */}
          <div className="ledger-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th></th>
                  <th>time</th>
                  <th>paddle</th>
                  <th>rail</th>
                  <th>call</th>
                  <th>looking for</th>
                  <th>bid</th>
                  <th>settlement</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <Fragment key={s.id}>
                    <tr
                      onClick={() => toggle(s.id)}
                      onKeyDown={(e) => rowKey(e, () => toggle(s.id))}
                      role="button"
                      tabIndex={0}
                      aria-expanded={open === s.id}
                      style={flashTx === s.tx ? { backgroundColor: "rgba(160,35,24,0.06)" } : undefined}
                    >
                      <td>
                        {s.thumb && !brokenThumbs.has(s.thumb) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="lthumb"
                            src={s.thumb}
                            alt=""
                            loading="lazy"
                            onError={() => setBrokenThumbs((b) => new Set(b).add(s.thumb!))}
                          />
                        ) : (
                          <span className="lthumb" style={{ display: "inline-block", background: "var(--paper-2)" }} />
                        )}
                      </td>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}><Ago iso={s.created_at} /></td>
                      <td className="mono" title={s.payer}>{short(s.payer)}</td>
                      <td><span className={`pill ${s.network.startsWith("stellar") ? "xlm" : "usdc"}`}>{railName(s.network)}</span></td>
                      <td className="mono">{s.endpoint}</td>
                      <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.query_hint}>
                        {s.query_hint || "—"}
                      </td>
                      <td className="mono">{railAmt(s)}</td>
                      <td className="mono">
                        {s.tx ? (
                          <a href={explorer(s)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--usdc)", textDecoration: "none" }}>
                            {short(s.tx)} ↗
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {open === s.id && (
                        <motion.tr className="detail" key={`d-${s.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <td colSpan={8}>
                            <motion.div
                              className="expand"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                            >
                              <SaleDetail s={s} />
                            </motion.div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* phones: receipt cards, not a compressed table */}
          <div className="salecards">
            {visible.map((s) => (
              <div className="salecard" key={s.id}>
                <button
                  type="button"
                  className="sc-head"
                  onClick={() => toggle(s.id)}
                  aria-expanded={open === s.id}
                >
                  {s.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <span className="sc-thumb" />
                  )}
                  <span className="sc-main">
                    <span className="sc-t">{s.lot_title || s.query_hint || s.endpoint}</span>
                    <span className="sc-sub">{railAmt(s)} · <Ago iso={s.created_at} /> · {railName(s.network)}</span>
                  </span>
                  <span className="sc-chev" aria-hidden="true">{open === s.id ? "−" : "+"}</span>
                </button>
                <AnimatePresence initial={false}>
                  {open === s.id && (
                    <motion.div
                      className="expand"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <div className="sc-body">
                        <SaleDetail s={s} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {!showAll && sales.length > INITIAL_ROWS && (
            <button type="button" className="showall" onClick={() => setShowAll(true)}>
              view all {count} sales ↓
            </button>
          )}
        </>
      )}
    </section>
    </MotionConfig>
  );
}
