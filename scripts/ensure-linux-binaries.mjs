// Ensures linux/arm64 sharp binaries exist in node_modules regardless of the
// install platform, so serverless (linux/arm64) deployments can dlopen them.
// Idempotent: skips packages already present at the required version.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const needed = [
  ["node_modules/@img/sharp-linux-arm64", "@img/sharp-linux-arm64", "0.35.5"],
  ["node_modules/@img/sharp-libvips-linux-arm64", "@img/sharp-libvips-linux-arm64", "1.3.4"],
  ["node_modules/@img/sharp-linux-x64", "@img/sharp-linux-x64", "0.35.5"],
  ["node_modules/@img/sharp-libvips-linux-x64", "@img/sharp-libvips-linux-x64", "1.3.4"],
  [
    "node_modules/@huggingface/transformers/node_modules/@img/sharp-linux-arm64",
    "@img/sharp-linux-arm64",
    "0.34.5",
  ],
  [
    "node_modules/@huggingface/transformers/node_modules/@img/sharp-libvips-linux-arm64",
    "@img/sharp-libvips-linux-arm64",
    "1.2.4",
  ],
  [
    "node_modules/@huggingface/transformers/node_modules/@img/sharp-linux-x64",
    "@img/sharp-linux-x64",
    "0.34.5",
  ],
  [
    "node_modules/@huggingface/transformers/node_modules/@img/sharp-libvips-linux-x64",
    "@img/sharp-libvips-linux-x64",
    "1.2.4",
  ],
];

const installed = (dir, version) => {
  const pkg = join(root, dir, "package.json");
  if (!existsSync(pkg)) return false;
  try {
    return JSON.parse(readFileSync(pkg, "utf8")).version === version;
  } catch {
    return false;
  }
};

for (const [dir, name, version] of needed) {
  if (installed(dir, version)) continue;
  const dest = join(root, dir);
  mkdirSync(dest, { recursive: true });
  const url = `https://registry.npmjs.org/${name}/-/${name.split("/")[1]}-${version}.tgz`;
  console.log(`[linux-binaries] fetching ${name}@${version}`);
  execFileSync("sh", ["-c", `curl -sfL "${url}" | tar xz -C "${dest}" --strip-components=1`]);
}
