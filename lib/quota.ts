// Atomic daily quotas in Postgres — survives cold starts and parallel
// invocations where an in-memory Map would lose updates. quota_take reserves
// a slot; quota_give releases one when a reserved attempt never spent money.
import { env } from "./env";

const svc = {
  apikey: env.supabaseService,
  Authorization: `Bearer ${env.supabaseService}`,
  "Content-Type": "application/json",
  "Accept-Profile": "almoneda",
  "Content-Profile": "almoneda",
};

async function rpc(fn: string, body: any): Promise<any> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`quota ${fn}: ${res.status}`);
  return res.json();
}

// Returns true when the caller may proceed (a slot was atomically reserved).
export async function takeQuota(key: string, limit: number): Promise<boolean> {
  try {
    return (await rpc("quota_take", { p_key: key, p_limit: limit })) === true;
  } catch {
    return true; // quota store down: fail open for unpaid demos, closed below for the purse
  }
}

export async function takeQuotaClosed(key: string, limit: number): Promise<boolean> {
  try {
    return (await rpc("quota_take", { p_key: key, p_limit: limit })) === true;
  } catch {
    return false; // never let an unknown quota spend the house purse
  }
}

export async function giveQuota(key: string): Promise<void> {
  try {
    await rpc("quota_give", { p_key: key });
  } catch {}
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
