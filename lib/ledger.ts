// The sales ledger: one row per settled payment, world-readable for the
// sales floor, written only by the server with the service key.
import { env } from "./env";

export type Sale = {
  id: number;
  payer: string;
  tx: string;
  network: string;
  amount: string;
  endpoint: string;
  query_hint: string;
  artwork_ids: string[];
  latency_ms: number | null;
  created_at: string;
};

const svc = {
  apikey: env.supabaseService,
  Authorization: `Bearer ${env.supabaseService}`,
  "Content-Type": "application/json",
  "Accept-Profile": "almoneda",
  "Content-Profile": "almoneda",
};

export async function insertSale(s: Omit<Sale, "id" | "created_at">): Promise<void> {
  // One retry, bounded latency — bookkeeping must never hang a paid response,
  // but a settled sale should not silently vanish either.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/sales`, {
        method: "POST",
        headers: { ...svc, Prefer: "return=minimal" },
        body: JSON.stringify(s),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return;
      console.warn(`ledger insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e: any) {
      console.warn(`ledger insert failed: ${e?.message ?? e}`);
    }
  }
}

export async function recentSales(limit = 40): Promise<Sale[]> {
  const res = await fetch(
    `${env.supabaseUrl}/rest/v1/sales?select=*&order=id.desc&limit=${limit}`,
    { headers: { apikey: env.supabaseAnon, Authorization: `Bearer ${env.supabaseAnon}`, "Accept-Profile": "almoneda" }, next: { revalidate: 0 } }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function salesCount(): Promise<number> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/sales?select=id`, {
    method: "HEAD",
    headers: { ...svc, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range") || "";
  const n = parseInt(range.split("/")[1] || "0", 10);
  return Number.isFinite(n) ? n : 0;
}
