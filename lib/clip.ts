// CLIP text + image embeddings matching the mellizo corpus exactly.
// The corpus was Xenova/clip-vit-base-patch32 at build time and swaps to
// patch16 (same 512-d output, different embedding space) when mellizo's
// round-3 migration lands — lib/corpus.ts corpusModel() detects which space
// is live and every embed call passes the id explicitly.
// Models are fetched from Hugging Face into /tmp at cold start (serverless-writable).
import { env as hfEnv, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import type { CorpusModel } from "./corpus-fingerprints";

hfEnv.cacheDir = "/tmp/hf-cache";

type Bundle = { tokP: Promise<any> | null; textP: Promise<any> | null; procP: Promise<any> | null; visP: Promise<any> | null };
const bundles = new Map<CorpusModel, Bundle>();
function bundle(model: CorpusModel): Bundle {
  let b = bundles.get(model);
  if (!b) { b = { tokP: null, textP: null, procP: null, visP: null }; bundles.set(model, b); }
  return b;
}

function l2norm(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export async function embedText(text: string, model: CorpusModel): Promise<number[]> {
  const b = bundle(model);
  b.tokP ??= AutoTokenizer.from_pretrained(model).catch((e) => { b.tokP = null; throw e; });
  b.textP ??= CLIPTextModelWithProjection.from_pretrained(model, { dtype: "q8" }).catch((e) => { b.textP = null; throw e; });
  const [tok, mdl] = await Promise.all([b.tokP, b.textP]);
  const inputs = tok([text], { padding: true, truncation: true });
  const { text_embeds } = await mdl(inputs);
  return l2norm(Array.from(text_embeds.data as Float32Array));
}

export async function embedImage(image: RawImage, model: CorpusModel): Promise<number[]> {
  const b = bundle(model);
  b.procP ??= AutoProcessor.from_pretrained(model).catch((e) => { b.procP = null; throw e; });
  b.visP ??= CLIPVisionModelWithProjection.from_pretrained(model, { dtype: "q8" }).catch((e) => { b.visP = null; throw e; });
  const [proc, mdl] = await Promise.all([b.procP, b.visP]);
  const inputs = await proc(image);
  const { image_embeds } = await mdl(inputs);
  return l2norm(Array.from(image_embeds.data as Float32Array));
}

// Decode a fetched image buffer into a RawImage. sharp handles jpeg/png/webp/gif.
// limitInputPixels rejects pixel bombs: an 8 MB compressed PNG can expand to
// hundreds of MB of raw pixels.
export async function decodeImage(buf: ArrayBuffer | Buffer): Promise<RawImage> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(buf as ArrayBuffer), { limitInputPixels: 30_000_000 })
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, info.channels as 1 | 2 | 3 | 4);
}
