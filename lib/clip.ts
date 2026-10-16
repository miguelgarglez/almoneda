// CLIP text + image embeddings matching the mellizo corpus exactly:
// Xenova/clip-vit-base-patch32, q8 weights, L2-normalized 512-d vectors.
// Models are fetched from Hugging Face into /tmp at cold start (serverless-writable).
import { env as hfEnv, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

hfEnv.cacheDir = "/tmp/hf-cache";

const MODEL_ID = "Xenova/clip-vit-base-patch32";

let tokP: Promise<any> | null = null;
let textP: Promise<any> | null = null;
let procP: Promise<any> | null = null;
let visP: Promise<any> | null = null;

function l2norm(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export async function embedText(text: string): Promise<number[]> {
  tokP ??= AutoTokenizer.from_pretrained(MODEL_ID).catch((e) => { tokP = null; throw e; });
  textP ??= CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8" }).catch((e) => { textP = null; throw e; });
  const [tok, mdl] = await Promise.all([tokP, textP]);
  const inputs = tok([text], { padding: true, truncation: true });
  const { text_embeds } = await mdl(inputs);
  return l2norm(Array.from(text_embeds.data as Float32Array));
}

export async function embedImage(image: RawImage): Promise<number[]> {
  procP ??= AutoProcessor.from_pretrained(MODEL_ID).catch((e) => { procP = null; throw e; });
  visP ??= CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8" }).catch((e) => { visP = null; throw e; });
  const [proc, mdl] = await Promise.all([procP, visP]);
  const inputs = await proc(image);
  const { image_embeds } = await mdl(inputs);
  return l2norm(Array.from(image_embeds.data as Float32Array));
}

// Decode a fetched image buffer into a RawImage. sharp handles jpeg/png/webp/gif.
export async function decodeImage(buf: ArrayBuffer): Promise<RawImage> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(buf)).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, info.channels as 1 | 2 | 3 | 4);
}
