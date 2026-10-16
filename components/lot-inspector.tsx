"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

export type InspectLot = {
  title: string;
  artist?: string | null;
  museum?: string | null;
  img?: string | null;
  accession?: string | null;
  rights?: string | null;
  date?: string | null;
  medium?: string | null;
  verified?: boolean;
  evidence_url?: string | null;
  hammer?: string | null;
  tx?: string | null;
  explorer_url?: string | null;
};

// One inspector for the whole floor: every artwork surface — a won lot, a
// ledger thumb, the last-lot hero — dispatches the same event and the tray
// opens over whatever the visitor was looking at.
export const inspect = (l: InspectLot) =>
  window.dispatchEvent(new CustomEvent("almoneda:inspect", { detail: l }));

function CopyBtn({ text }: { text: string }) {
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
      {state === "ok" ? "copied" : state === "err" ? "failed" : "copy lot JSON"}
    </button>
  );
}

export default function LotInspector() {
  const [lot, setLot] = useState<InspectLot | null>(null);

  useEffect(() => {
    const on = (e: Event) => setLot((e as CustomEvent).detail as InspectLot);
    window.addEventListener("almoneda:inspect", on);
    return () => window.removeEventListener("almoneda:inspect", on);
  }, []);

  useEffect(() => {
    if (!lot) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLot(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lot]);

  const json = lot
    ? JSON.stringify(
        {
          title: lot.title,
          artist: lot.artist ?? null,
          museum: lot.museum ?? null,
          provenance: {
            accession: lot.accession ?? null,
            rights: lot.rights ?? null,
            verified: !!lot.verified,
            evidence_url: lot.evidence_url ?? null,
          },
          hammer: lot.hammer ?? null,
          settlement: lot.tx ? { transaction: lot.tx, explorer_url: lot.explorer_url ?? null } : null,
        },
        null,
        2
      )
    : "";

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {lot && (
          <motion.div
            className="inspect-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`${lot.title} — catalogue detail`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLot(null)}
          >
            <motion.div
              className="inspect-tray"
              initial={{ y: 26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="it-img">
                {lot.img ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={lot.img} alt={lot.title} />
                ) : (
                  <div className="it-miss">the museum holds this image — the catalogue record has it</div>
                )}
              </div>
              <div className="it-body">
                <span className="it-tag">catalogue entry</span>
                <h3 className="it-t">{lot.title}</h3>
                {lot.artist && <div className="it-a">{lot.artist}</div>}
                {lot.museum && <div className="it-m">{lot.museum}</div>}
                <dl className="it-prov">
                  {lot.date && (
                    <>
                      <dt>date</dt>
                      <dd>{lot.date}</dd>
                    </>
                  )}
                  {lot.medium && (
                    <>
                      <dt>medium</dt>
                      <dd>{lot.medium}</dd>
                    </>
                  )}
                  {lot.accession && (
                    <>
                      <dt>accession</dt>
                      <dd className="mono">{lot.accession}</dd>
                    </>
                  )}
                  {lot.rights && (
                    <>
                      <dt>rights</dt>
                      <dd>
                        <span className={lot.verified ? "ok" : ""}>
                          {lot.rights}
                          {lot.verified ? " ✓" : ""}
                        </span>
                      </dd>
                    </>
                  )}
                  {lot.hammer && (
                    <>
                      <dt>hammer</dt>
                      <dd className="mono">{lot.hammer}</dd>
                    </>
                  )}
                </dl>
                <div className="it-actions">
                  {lot.evidence_url && (
                    <a href={lot.evidence_url} target="_blank" rel="noreferrer" className="btn ghost">
                      catalogue record ↗
                    </a>
                  )}
                  {lot.explorer_url && (
                    <a href={lot.explorer_url} target="_blank" rel="noreferrer" className="btn ghost">
                      settlement ↗
                    </a>
                  )}
                  <CopyBtn text={json} />
                </div>
                <button type="button" className="it-close" onClick={() => setLot(null)} aria-label="close">
                  esc to close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
