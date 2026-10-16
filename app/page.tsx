import { corpusSize, currentLot, MUSEUMS } from "@/lib/corpus";
import { salesCount, recentSales } from "@/lib/ledger";
import LotStage from "@/components/lot-stage";
import BidRoom from "@/components/bid-room";
import FloorFeed from "@/components/floor-feed";

export const revalidate = 60;

const TICKER = [
  "public domain", "x402", "agents only", "per call", "no accounts", "no api keys",
  "provenance in the json", "usdc · xlm", "sold", "sold", "sold",
];

async function floorData() {
  const [size, total, recent, lot] = await Promise.all([
    corpusSize(),
    salesCount(),
    recentSales(20),
    currentLot(),
  ]);
  return { size, total, recent, lot };
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
  const { size, total, recent, lot } = await floorData();

  return (
    <main>
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
        </div>
      </header>

      <div className="statbar">
        <div className="wrap">
          <div className="row">
            <span>corpus <b>{size?.toLocaleString("en") ?? "—"}</b> works</span>
            <span><b>4</b> museums</span>
            <span><b>{total}</b> lots sold</span>
            <span>text search <b>$0.01</b>/call</span>
            <span>image search <b>$0.02</b>/call</span>
            <span>protocol <b>x402 v2</b></span>
          </div>
        </div>
      </div>

      <section className="wrap">
        <div className="block">
          <LotStage
            initial={
              lot
                ? {
                    id: lot.id,
                    title: lot.title,
                    artist: lot.artist,
                    date: lot.date,
                    medium: lot.medium,
                    image: { display: lot.image_url, thumb: lot.thumb_url || lot.image_url, width: lot.img_w ?? null, height: lot.img_h ?? null },
                    museum: MUSEUMS[lot.source]?.name ?? lot.source,
                    object_url: lot.object_url,
                  }
                : null
            }
          />
          <div>
            <BidRoom />
            <section className="prov" style={{ padding: "26px 0 0" }}>
              <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="museum" style={{ borderStyle: "dashed" }}>
                  <h3>what a lot is</h3>
                  <p>
                    One JSON object: the image, its catalogue title, artist, medium — and a provenance block with the
                    museum's accession number, a rights statement, and the URL that proves it. If a check could not be
                    run, the lot says so. Nothing is sold as verified that was not verified.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="rail">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>{t === "sold" ? <b>SOLD —</b> : `${t} —`}</span>
          ))}
        </div>
      </div>

      <div className="wrap">
        <FloorFeed initial={recent as any} total={total} />
      </div>

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

      <footer className="site">
        <div className="wrap">
          <div className="row">
            <span>almoneda — an auction house where machines are the only bidders</span>
            <span>
              testnet only ·{" "}
              <a href="https://github.com/miguelgarglez/almoneda" style={{ color: "var(--usdc)" }}>github</a> · built in{" "}
              <a href="https://github.com/miguelgarglez" style={{ color: "var(--usdc)" }}>the lab</a>
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
