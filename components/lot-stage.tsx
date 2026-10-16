"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Lot = {
  id: string;
  title: string;
  artist: string;
  date: string;
  medium: string;
  image: { display: string; thumb: string; width: number | null; height: number | null };
  museum: string;
  object_url: string;
};

// The work on the block. Rotates every two minutes — same lot for everyone
// on the floor at the same moment.
const lotNumber = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 10000;
};

export default function LotStage({ initial }: { initial: Lot | null }) {
  const [lot, setLot] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const no = lot ? lotNumber(lot.id) : 0;
  const ratio =
    lot?.image.width && lot?.image.height ? `${lot.image.width} / ${lot.image.height}` : "4 / 3";

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/v1/floor", { cache: "no-store" });
        const j = await r.json();
        if (j?.lot?.id && j.lot.id !== lot?.id) {
          setLot(j.lot);
          setLoaded(false);
        }
      } catch {}
    };
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [lot?.id]);

  if (!lot) {
    return (
      <div className="easel">
        <div className="frame" style={{ minHeight: 380, display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 12 }}>
          no lot on the block — corpus unreachable
        </div>
      </div>
    );
  }

  return (
    <div className="easel">
      <div className="lotno">LOT {String(no).padStart(4, "0")}</div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={lot.id}
          className="frame"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          {/* the mount holds the work's real aspect ratio from corpus data —
              the frame never moves when the pixels arrive */}
          <div className="mount" style={{ aspectRatio: ratio, maxHeight: 520 }}>
            {!loaded && <div className="hanging">hanging the lot…</div>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lot.image.display}
              alt={`${lot.title}${lot.artist ? " — " + lot.artist : ""}`}
              loading="eager"
              className={loaded ? "on" : ""}
              onLoad={() => setLoaded(true)}
            />
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="plate">
        <motion.div key={lot.id + "-meta"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <h1>{lot.title || "Untitled"}</h1>
          {lot.artist && <div className="artist">{lot.artist}{lot.date ? `, ${lot.date}` : ""}</div>}
          <div className="meta">
            {lot.medium && <div>{lot.medium}</div>}
            <div><b>{lot.museum}</b></div>
            <a href={lot.object_url} target="_blank" rel="noreferrer" style={{ color: "var(--ink-2)", textDecoration: "underline", textUnderlineOffset: 3, fontSize: 11 }}>
              catalogue record ↗
            </a>
          </div>
          <div className="stamp">provenance · public domain</div>
        </motion.div>
      </div>
    </div>
  );
}
