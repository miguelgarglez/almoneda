// SSRF-hardened image fetch: every caller-supplied URL is resolved and checked
// against private/loopback/reserved ranges before the request, and again on
// every redirect hop. The body is streamed with a hard byte cap so a hostile
// or broken origin cannot exhaust a function's memory.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_IMAGE_BYTES = 8_000_000;
export const MAX_REDIRECTS = 3;

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local + ULA
  const p = v.split(".").map((x) => parseInt(x, 10));
  if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved/broadcast
  return false;
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("image_url host is not public");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("image_url host is not public");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`image_url host does not resolve: ${host}`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("image_url host is not public");
  }
}

async function readCapped(res: Response, cap: number): Promise<Buffer> {
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) throw new Error(`image too large (max ${cap / 1_000_000} MB)`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

export async function fetchPublicImage(rawUrl: string, timeoutMs = 8000): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("image_url is not a valid URL");
  }
  const t0 = Date.now();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("image_url must be http(s)");
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "almoneda/1.0 (public-domain image service)", accept: "image/*" },
      signal: AbortSignal.timeout(Math.max(1000, timeoutMs - (Date.now() - t0))),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`redirect with no location (${res.status})`);
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!ct.startsWith("image/")) throw new Error(`not an image: ${ct || "unknown content type"}`);
    const len = parseInt(res.headers.get("content-length") || "0", 10);
    if (len > MAX_IMAGE_BYTES) throw new Error(`image too large (max ${MAX_IMAGE_BYTES / 1_000_000} MB)`);
    return readCapped(res, MAX_IMAGE_BYTES);
  }
  throw new Error("too many redirects");
}
