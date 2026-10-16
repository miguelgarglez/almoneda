---
format: 1920x1080
duration: 30s
message: "An auction house where machines are the only bidders — watch a real x402 payment settle"
arc: Demo Loop — hook → the floor → the wire → settlement → CTA
audience: agent builders, protocol-curious devs on X
mode: autonomous
music: none
---

## Frame 1 — Hook

- scene: An auction paddle of type — the wordmark lands, then the thesis punches in over vellum with a real artwork hanging beside it
- duration: 4s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- blueprint: titlecard-reveal (Adapt)
- focal: capture/assets/1943-479-web.jpg
- roles: 1943-479-web.jpg = cutout (the hanging lot) · dt3073.jpg = supporting (smaller, deeper, dimmed) · vellum field = background
- voiceover: "an auction house where machines are the only bidders"

Cold open on paper. The wordmark sets in ink on vellum like a lot being called; the thesis lands in two spoken cues. Stillness at the end — no music, the quiet is the confidence.

Adapt: keep the lock-and-hold title reveal; the reveal's second act is the thesis caption arriving in two beats, and a real artwork hangs in a thin gilt frame at right instead of a generic icon.
Scene 1 (0.0–1.4s): vellum field; `almoneda` sets in display serif ink, a gilt hairline draws under it. Centered, the artwork hangs right-of-center on a hairline. 
Scene 2 (1.4–3.2s): the thesis lands in two beats — "an auction house" first, then "where machines are the only bidders" — mono voice, settling like placed lot cards.
Scene 3 (3.2–4.0s): hold the read; stillness.

## Frame 2 — The floor

- scene: The real site framed as a lot card: the locked terminal — lot, console, ledger — with the stat bar and ticker moving
- duration: 5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-floor.html
- blueprint: video-text-pivot (Adapt)
- focal: assets/first-load.mp4
- roles: first-load.mp4 = cutout (framed window, ~70% of canvas) · full-page.png = unused fallback
- voiceover: "every row on this floor is a payment that actually settled"

The product, as-is: the locked terminal in a framed window, mono chips reading the layout for the viewer before the demo starts.

Adapt: keep the live-footage-plus-pivoting-labels shape; the labels are mono column chips rather than marketing callouts — lot / console / ledger.
Scene 1 (0.0–1.2s): the framed terminal window lands center, thin ink border, "THE FLOOR" tab. Rule-of-thirds, footage dominates.
Scene 2 (1.2–3.0s): three small mono chips pin in sequence — `the lot` at the artwork column, `the console` at center, `the ledger` at right.
Scene 3 (3.0–5.0s): the caption "every row is a settled on-chain payment" settles under the frame; hold.

## Frame 3 — The wire

- scene: Real footage, real timings — an agent clicks BID, the 402 comes back, the bid is signed, the PAYMENT-SIGNATURE goes out
- duration: 10s
- transition_in: cut
- status: animated
- src: compositions/frames/03-wire.html
- blueprint: panel-edit-live-sync (Adapt)
- focal: assets/wire-a.mp4
- roles: wire-a.mp4 = cutout (console-column crop ~70% of canvas) · protocol-step captions = supporting (pin as each tape line lands)
- voiceover: "the agent asks. the house answers: 402 — payment required. it signs. the signature goes out."

The signature beat. Footage plays at real speed; the tape grows. Mono captions name each protocol step the moment its line appears on the tape — the footage is the clock, not a voice track.

Adapt: keep the live-sync reveal where on-screen events trigger labels; the crop sits on the console column so the tape is legible, and the labels are the protocol's own vocabulary.
Scene 1 (0.0–1.5s): the framed window lands cropped on the console column; the BID press happens on screen.
Scene 2 (1.5–3.5s): `402 payment required` caption pins beside the tape as that line lands; accepts list visible.
Scene 3 (3.5–6.0s): `signing the bid` caption — Soroban authorization, fees sponsored.
Scene 4 (6.0–8.5s): `PAYMENT-SIGNATURE sent` lands; the wire cursor pulses.
Scene 5 (8.5–10.0s): a low, quiet caption settles: "this is the real protocol — x402 v2". Hold.

## Frame 4 — Settled

- scene: The wire lands: `settled on-chain`, the lots are delivered, the new sale lands at the top of the ledger and its receipt opens
- duration: 8s
- transition_in: cut
- status: animated
- src: compositions/frames/04-settled.html
- blueprint: video-text-pivot (Adapt)
- focal: assets/wire-b.mp4
- roles: wire-b.mp4 = cutout (full terminal framed, ~75%) · sold-red SETTLED stamp = supporting · ledger-row highlight = supporting
- voiceover: "settled on Stellar testnet. the tx hash is real. the row is public. the artwork is public domain — the accession number is in the JSON."

The payoff — this is the climactic beat and it lands hard: the settlement line, the delivered lots, the new row on the floor.

Adapt: keep the footage-plus-proof-labels shape; the proofs are the tx hash, the fresh ledger row, and a single sold-red `SETTLED` stamp — the only red in the film.
Scene 1 (0.0–2.5s): the wire hangs mid-flight, then `settled on-chain` lands on the tape — a sold-red SETTLED stamp presses over the console corner.
Scene 2 (2.5–5.0s): the lots resolve on screen — real titles, real accession numbers; caption: "provenance in the JSON".
Scene 3 (5.0–8.0s): the new sale slides to the top of the ledger and its receipt opens; caption: "every row is public". Hold on the landed state.

## Frame 5 — End card

- scene: The wordmark lockup over vellum — URL below, one quiet line under it
- duration: 3s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-end.html
- blueprint: logo-assemble-lockup (Adapt)
- focal: capture/assets/icon-icon-any.svg
- roles: wordmark lockup = cutout (centered, dominant) · icon svg = supporting · favicon = unused fallback
- voiceover: "almoneda — almoneda-app.vercel.app — testnet money, real protocol"

The lockup assembles and then absolutely nothing moves — the stillness is the signature.

Adapt: keep the assemble-then-lock shape; the URL lands as a mono line under a gilt rule rather than a button.
Scene 1 (0.0–1.2s): `almoneda` wordmark sets center in display serif, the icon mark settling beside it; gilt hairline draws beneath.
Scene 2 (1.2–2.2s): `almoneda-app.vercel.app` lands in mono under the rule.
Scene 3 (2.2–3.0s): "testnet money, real protocol" in small mono; hold to the end — stillness.

## Video direction

Silent piece — kinetic captions carry the whole message and must be readable muted at a glance. Every Scene's reveals are paced to the caption cues (the captions are the voice track), never front-loaded.

- **Palette system** — `frame.md` roles: vellum/ink for canvas and text, gilt for hairlines and accession marks, USDC-blue only as the existing footage's accents, and sold-red exactly once — the SETTLED stamp in Frame 4.
- **Type** — IBM Plex Serif for display (wordmark, thesis); IBM Plex Mono for protocol voice, captions, chips, and URL. Never mixed within an element.
- **Motion grammar** — long-tail power3 eases; text and cards settle into place like lot cards being set down (short rise-and-settle, no bounce). Footage plays at real speed — the wire is honest. Reveals land on their caption cue; during a hold at most a subtle caption-cursor pulse stays alive.
- **Rhythm / stillness allocation** — Frames 1 and 5 end on held reads; Frame 3 is the busy middle (four protocol beats); Frame 4 is the climax that resolves to a held landed state. The video ends still.
- **Negative list** — no simulated UI, no rebuilt page, no fake tape lines; no generic AI gradients, bokeh, or floating orbs; no browser chrome or real cursors; no nav bars; no motion confetti or reward bursts; never front-load-then-freeze, never independent-floating-elements screensaver drift.
- **Caption-band keep-out** — content lives in the top ~83% of canvas; the bottom band belongs to the caption skin.
