---
workflow: product-launch-video
flow: automation
storyboard: no
message: "An auction house where machines are the only bidders — watch a real x402 payment settle"
destination: x-feed
aspect: 1920x1080
language: en
length: 30s
angle: product
style_preset:
---

## Intent

Almoneda is a working service, not a mockup: an agent pays a cent over x402 and leaves with a public-domain artwork plus provenance. The video must show the real thing — the floor terminal, the live payment tape (402 → signature → settlement), the ledger row landing. Auction-house tone: vellum, ink, gilt, a red SOLD. Hook inside two seconds; end on the URL.

## Assets

- capture/screenshots/ — the real site, locked-terminal layout (vellum + IBM Plex)
- Real UI footage: recorded with Playwright into this project as assets/ (bid click → tape → settlement → new ledger row)

## Customizations

- Feature the live NDJSON payment tape as the signature beat — real ms timings, real tx hash
- End card: wordmark + https://almoneda-app.vercel.app
- No voiceover — kinetic captions carry the message (readable muted)

## Notes

- Silent project: music: none, no SCRIPT.md, no sfx. Autonomous run — no review gates.
- Keep under 50 MB; 1920x1080.
