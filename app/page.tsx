import { corpusSize, saleThumbs } from "@/lib/corpus";
import { salesCount, recentSales } from "@/lib/ledger";
import BidRoom from "@/components/bid-room";
import LiveStats from "@/components/live-stats";
import FloorFeed from "@/components/floor-feed";
import LotInspector from "@/components/lot-inspector";
import LastLot from "@/components/last-lot";
import SettleStrip from "@/components/settle-strip";
import { SurfaceToggle, SurfaceClose, SheetA11y } from "@/components/surface-sheet";

export const revalidate = 60;

async function floorData() {
  const [size, total, recent] = await Promise.all([
    corpusSize(),
    salesCount(),
    recentSales(20),
  ]);
  return { size, total, recent };
}

const RECEIPT = `# GET /v1/search?q=storm%20at%20sea
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: {"x402Version":2,"accepts":[
  {"scheme":"exact","network":"eip155:84532",
   "asset":"0x036CbD…f7e","amount":"10000",
   "payTo":"0x0706…6119"},
  {"scheme":"exact","network":"stellar:testnet",
   "asset":"CDLZFC…YSC","amount":"100000",
   "payTo":"GCQUYY…PLZD","extra":{"areFeesSponsored":true}}]}

# sign → retry with PAYMENT-SIGNATURE → 200
PAYMENT-RESPONSE: {"success":true,
  "transaction":"c45f702a…071c75","network":"stellar:testnet"}`;

export default async function Page() {
  const { size, total, recent } = await floorData();
  // join every delivered work — receipts name all the lots a sale carried
  const thumbs = await saleThumbs([...new Set(recent.flatMap((s) => s.artwork_ids ?? []))]);
  const recentWithThumbs = recent.map((s) => ({
    ...s,
    thumb: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.thumb ?? null) : null,
    lot_title: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.title ?? null) : null,
    lot_url: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.object_url ?? null) : null,
    lot_img: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.image ?? null) : null,
    lot_artist: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.artist ?? null) : null,
    lot_museum: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.museum ?? null) : null,
    lots: (s.artwork_ids ?? [])
      .map((id) => thumbs.get(id))
      .filter(Boolean)
      .map((l) => ({ title: l!.title, object_url: l!.object_url })),
  }));
  const last = recent[0];

  return (
    <main>
      <input type="checkbox" id="sheet-t" className="sheet-t" aria-label="show the machine surface" />
      <SheetA11y />
      <header className="mast">
        <div className="wrap">
          <div className="row">
            <div>
              <div className="wordmark">almoneda</div>
              <div className="sub">an auction house where machines are the only bidders</div>
            </div>
            <div className="live">
              <span className={`dot ${size ? "on" : ""}`} />
              <span>{size ? "floor open" : "floor closed"}</span>
            </div>
          </div>
          <p className="what">
            Agents pay a cent or two per search and leave with an image, its catalogue data, and license proof.
            Every settled payment lands on the public floor below.
          </p>
        </div>
      </header>

      <div className="statbar">
        <div className="wrap">
          <div className="row">
            <span>corpus <b>{size?.toLocaleString("en") ?? "—"}</b> works</span>
            <LiveStats
              initialTotal={total}
              initialLast={last ? { query_hint: last.query_hint, endpoint: last.endpoint, amount: last.amount, network: last.network } : null}
            />
            <span className="opt"><b>4</b> museums</span>
            <span className="opt">text <b>$0.01</b> · image <b>$0.02</b></span>
            <span className="opt">protocol <b>x402 v2</b></span>
          </div>
        </div>
      </div>

      <section className="deck">
        <div className="floorgrid">
          <div className="console-col">
            {/* phones get the newest lot before the console — the first
                viewport already shows a real artwork and the bid action */}
            <div className="hero-lot">
              <LastLot sale={recentWithThumbs[0] ?? null} listen />
            </div>
            <BidRoom />
            <p className="fineprint" style={{ marginTop: 14 }}>
              A lot is one JSON object: the image, its catalogue title, artist, medium — and a provenance block
              with the museum's accession number, a rights statement, and the URL that proves it. If a check
              could not be run, the lot says so.
            </p>
          </div>
          <FloorFeed initial={recentWithThumbs as any} total={total} corpusDown={!size} />
        </div>
      </section>

      <SettleStrip initial={recentWithThumbs as any} />

      <div className="sheet">
        <SurfaceClose />
        <div className="wrap">
        <section className="mach">
          <h2>The machine surface</h2>
          <p className="sub">An agent finds this service through the discovery document, pays per call, and leaves with the receipt on-chain.</p>
          <div className="grid">
            <pre className="receipt">{RECEIPT}</pre>
            <div>
              <table className="endpoints">
                <tbody>
                  <tr><td><code>GET /v1/search?q=…&n=5</code></td><td className="pr">$0.01</td></tr>
                  <tr><td><code>POST /v1/search/image</code></td><td className="pr">$0.02</td></tr>
                  <tr><td><code>POST /mcp</code> <span style={{ color: "var(--ink-3)" }}>paid MCP tools</span></td><td className="pr">$0.01–0.02</td></tr>
                  <tr><td><code>GET /v1/demo/search</code> <span style={{ color: "var(--ink-3)" }}>unpaid preview</span></td><td className="pr free">free ×3/day</td></tr>
                  <tr><td><code>GET /v1/floor</code> <span style={{ color: "var(--ink-3)" }}>the sales ledger</span></td><td className="pr free">free</td></tr>
                  <tr><td><code>GET /v1/status</code></td><td className="pr free">free</td></tr>
                  <tr><td><code>GET /llms.txt</code> <span style={{ color: "var(--ink-3)" }}>the agent guide</span></td><td className="pr free">free</td></tr>
                </tbody>
              </table>
              <ul>
                <li><a href="/llms.txt">llms.txt — how an agent uses this house</a></li>
                <li><a href="/openapi.json">openapi.json — the contract</a></li>
                <li><a href="/.well-known/x402">x402 discovery declaration (Bazaar)</a></li>
                <li><a href="/v1/floor">/v1/floor — the ledger, as JSON</a></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="prov">
          <h2>Provenance, not vibes</h2>
          <p className="sub">Every lot carries the museum's own accession number and a rights statement with evidence — the part agents usually have to guess.</p>
          <div className="grid">
            <div className="museum">
              <h3>The Metropolitan Museum of Art</h3>
              <span className="r">CC0 1.0 · open access</span>
              <p>Accession numbers seeded from the Met's published object data; Commons-hosted works re-checked against their file pages.</p>
            </div>
            <div className="museum">
              <h3>Cleveland Museum of Art</h3>
              <span className="r">CC0 1.0 · open access</span>
              <p>Rights re-checked against the open-access API per object, lazily, then cached.</p>
            </div>
            <div className="museum">
              <h3>Art Institute of Chicago</h3>
              <span className="r">CC0 1.0 · public domain</span>
              <p><code>is_public_domain</code> verified per object via the artic.edu API.</p>
            </div>
            <div className="museum">
              <h3>National Gallery of Art</h3>
              <span className="r">open access images</span>
              <p>NGA's published open-access policy; object pages linked as evidence.</p>
            </div>
          </div>
        </section>
        </div>
      </div>

      <footer className="site">
        <div className="wrap">
          <div className="row">
            <span>almoneda — an auction house where machines are the only bidders</span>
            <span>
              <SurfaceToggle /> · testnet only ·{" "}
              <a href="https://github.com/miguelgarglez/almoneda" style={{ color: "var(--usdc)" }}>github</a> · built in{" "}
              <a href="https://github.com/miguelgarglez" style={{ color: "var(--usdc)" }}>the lab</a>
            </span>
          </div>
        </div>
      </footer>
      <LotInspector />
    </main>
  );
}
