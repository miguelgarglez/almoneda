"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import "number-flow";

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "number-flow": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { value?: number };
      }
    }
  }
}

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
  latency_ms?: number | null;
  created_at: string;
};

const railName = (n: string) => (n.startsWith("stellar") ? "XLM" : n.includes("84532") ? "USDC" : n);
const railAmt = (s: Sale) =>
  s.network.startsWith("stellar") ? `${(parseInt(s.amount, 10) / 1e7).toFixed(2)} XLM` : `$${(parseInt(s.amount, 10) / 1e6).toFixed(2)}`;
const explorer = (s: Sale) =>
  s.network.startsWith("stellar") ? `https://stellar.expert/explorer/testnet/tx/${s.tx}` : `https://sepolia.basescan.org/tx/${s.tx}`;
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
// Digits morph place-value by place-value instead of a numeric crossfade.
function Count({ value }: { value: number }) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (reduce) return <>{value}</>;
  return (
    <span role="text" aria-label={String(value)}>
      <number-flow value={value} aria-hidden="true" />
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

export default function FloorFeed({ initial, total }: { initial: Sale[]; total: number }) {
  const [sales, setSales] = useState(initial);
  const [count, setCount] = useState(total);
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [flashTx, setFlashTx] = useState<string | null>(null);
  const seen = useRef(new Set(initial.map((s) => s.id)));

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        if (Array.isArray(j?.sales?.recent)) {
          setSales(j.sales.recent);
          setCount(j.sales.total ?? 0);
          j.sales.recent.forEach((s: Sale) => seen.current.add(s.id));
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
    // flash the row matching the console's settlement once it appears
    if (!flashTx) return;
    const row = sales.find((s) => s.tx === flashTx);
    if (row) setOpen(row.id);
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
      document.getElementById("floor")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    window.addEventListener("almoneda:open-latest", onOpenLatest);
    return () => window.removeEventListener("almoneda:open-latest", onOpenLatest);
  }, [sales]);

  return (
    <section className="floor" id="floor">
      <h2>
        The floor · <Count value={count} /> {count === 1 ? "lot" : "lots"} sold
      </h2>
      <p className="sub">
        <span className={`dot ${live ? "on" : ""}`} style={{ display: "inline-block", marginRight: 8 }} />
        Every row is a settled on-chain payment — click one to open the catalogue entry. Testnet money, real protocol.
      </p>
      {sales.length === 0 ? (
        <div className="empty">The gavel has not fallen yet. Send an agent to bid above — its settlement will appear here.</div>
      ) : (
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
            {sales.map((s) => (
              <Fragment key={s.id}>
                <tr
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  aria-expanded={open === s.id}
                  style={flashTx === s.tx ? { backgroundColor: "rgba(160,35,24,0.06)" } : undefined}
                >
                  <td>
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="lthumb" src={s.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
                {open === s.id && (
                  <tr className="detail">
                    <td colSpan={8}>
                      <div className="expand">
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
                          <span className="lab">lot won</span>
                          <span>
                            {s.lot_url ? (
                              <a href={s.lot_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                {s.lot_title ?? s.artwork_ids?.[0] ?? "—"} ↗
                              </a>
                            ) : (
                              s.lot_title ?? s.artwork_ids?.[0] ?? "—"
                            )}
                            {s.artwork_ids && s.artwork_ids.length > 1 ? ` +${s.artwork_ids.length - 1}` : ""}
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
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}


