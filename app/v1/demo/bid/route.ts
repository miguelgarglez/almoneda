import { NextRequest, NextResponse } from "next/server";
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer, getHorizonClient } from "@x402/stellar";
import { privateKeyToAccount } from "viem/accounts";
import { env, USDC_BASE_SEPOLIA, EXPLORER, EXPLORER_STELLAR, X402_NETWORK, X402_NETWORK_STELLAR, XLM_NATIVE_SAC } from "@/lib/env";
import { takeQuotaClosed, giveQuota, clientIp } from "@/lib/quota";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

// "Send an agent to bid": a server-side buyer agent signs a real payment
// and buys from our own paid endpoint, on real testnet money.
// The tape is a live wire: NDJSON steps are flushed the moment each
// protocol event happens — the 402, the signature, the settlement — not
// replayed from a finished response.
// Quotas are atomic in Postgres — the purse is finite and races would spend it.

const SUGGESTED = ["storm at sea", "a saint in gold", "portrait of a dog", "the harvest", "a sleeping child", "winter light", "an old violin"];

async function buyerBalance(addr: string): Promise<bigint | null> {
  try {
    const r = await fetch("https://sepolia.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE_SEPOLIA, data: "0x70a08231000000000000000000000000" + addr.slice(2).toLowerCase() }, "latest"] }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    return j.result ? BigInt(j.result) : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ipKey = `bid:${ip}`;
  const gKey = "bid:global";
  if (!(await takeQuotaClosed(ipKey, 3))) return NextResponse.json({ error: "demo_quota", message: "Three bids a day from the public purse. Agents with their own wallet buy any time — see /llms.txt." }, { status: 429 });
  if (!(await takeQuotaClosed(gKey, 60))) {
    await giveQuota(ipKey);
    return NextResponse.json({ error: "purse_empty", message: "The house purse is spent for today. It refills at midnight UTC." }, { status: 429 });
  }
  const refund = async () => { await giveQuota(ipKey); await giveQuota(gKey); };
  if (!env.buyerKey && !env.buyerStellar) { await refund(); return NextResponse.json({ error: "no_buyer", message: "The house buyer is not configured." }, { status: 503 }); }

  // Prefer USDC on Base Sepolia when the EVM purse is funded; otherwise the
  // Stellar purse pays in XLM (friendbot-refillable, facilitator-sponsored).
  let rail: "evm" | "stellar" | null = null;
  let account: ReturnType<typeof privateKeyToAccount> | null = null;
  let stellarSigner: Awaited<ReturnType<typeof createEd25519Signer>> | null = null;
  if (env.buyerKey) {
    account = privateKeyToAccount(env.buyerKey);
    const bal = await buyerBalance(account.address);
    if (bal !== null && bal >= BigInt(10000)) rail = "evm";
  }
  if (!rail && env.buyerStellar) {
    try {
      stellarSigner = await createEd25519Signer(env.buyerStellar, X402_NETWORK_STELLAR);
      const horizon = getHorizonClient(X402_NETWORK_STELLAR);
      const acct = await horizon.loadAccount(stellarSigner.address).catch(() => null);
      const xlm = acct?.balances?.find((b: any) => b.asset_type === "native")?.balance;
      if (acct && parseFloat(xlm ?? "0") >= 0.1) rail = "stellar";
    } catch {
      stellarSigner = null;
    }
  }
  if (!rail) {
    await refund();
    return NextResponse.json({ error: "purse_empty", message: "The house buyer is out of test funds. It refills from the Circle faucet (USDC) or friendbot (XLM)." }, { status: 503 });
  }

  let query: string;
  try {
    const body = await req.json().catch(() => ({}));
    query = String(body?.q || SUGGESTED[Math.floor(Math.random() * SUGGESTED.length)]).slice(0, 200);
  } catch {
    query = "storm at sea";
  }

  const t0 = Date.now();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: Record<string, unknown>) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const step = (step: string, detail: string) => send({ type: "step", step, detail, ms: Date.now() - t0 });
      try {
        const client = new x402Client();
        if (rail === "evm" && account) client.register(X402_NETWORK as `eip155:${number}`, new ExactEvmScheme(account));
        else if (stellarSigner) {
          client.register(X402_NETWORK_STELLAR, new ExactStellarScheme(stellarSigner));
          client.setSpendControls({
            allowedAssets: [{ network: X402_NETWORK_STELLAR, asset: XLM_NATIVE_SAC, maxAmountPerPayment: "1000000" }],
          });
        }
        // hook into the client's payment lifecycle so each tape line lands
        // when the protocol event actually happens
        client.onBeforePaymentCreation(async () => {
          step("402 payment required", "accepts: $0.01 USDC on Base Sepolia · 0.01 XLM on Stellar testnet");
          step("signing the bid", rail === "evm" ? "EIP-3009 typed-data signature" : "Soroban authorization entry, fees sponsored");
        });
        client.onAfterPaymentCreation(async () => {
          step("PAYMENT-SIGNATURE sent", "retrying with the payment attached");
        });
        const paidFetch = wrapFetchWithPayment(fetch, client);
        const url = new URL("/v1/search", req.nextUrl.origin);
        url.searchParams.set("q", query);
        url.searchParams.set("n", "3");
        step("GET /v1/search", `q="${query}"`);
        const res = await paidFetch(url.toString());
        const settle = decodePaymentResponseHeader(res.headers.get("payment-response") ?? "");
        const data = await res.json().catch(() => null);
        if (!res.ok || !settle?.transaction) {
          // the reserved slot is only spent when a payment actually settled
          await refund();
          send({ type: "error", error: "bid_failed", status: res.status });
          ctrl.close();
          return;
        }
        step("settled on-chain", `${settle.network} · tx ${String(settle.transaction).slice(0, 18)}…`);
        const winner = data?.results?.[0];
        step(
          "200 delivered",
          winner ? `"${String(winner.title).slice(0, 60)}"${winner.artist ? ` — ${winner.artist}` : ""} · ${data.results.length} lots, each with provenance` : `${data?.results?.length ?? 0} lots`,
        );
        const payer = rail === "evm" ? account!.address : stellarSigner!.address;
        const explorer = rail === "evm" ? EXPLORER : EXPLORER_STELLAR;
        send({
          type: "result",
          agent: { address: payer, rail, note: rail === "evm" ? "A testnet wallet. It paid $0.01 of test USDC so you could watch." : "A testnet agent. It paid 0.01 XLM via Soroban so you could watch." },
          query,
          settlement: settle,
          explorer_url: settle?.transaction ? explorer + settle.transaction : null,
          lots: data?.results ?? [],
        });
      } catch (e: any) {
        await refund();
        send({ type: "error", error: "bid_failed", message: e?.message?.slice(0, 300) });
      }
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
