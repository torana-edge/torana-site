import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

const fontRoot = "https://raw.githubusercontent.com/vercel/geist-font/a6d260e6cbc07eafdfad438f33601fe3c38b1e6f/fonts/Geist/ttf/";
export const fonts = [
  { url: fontRoot + "Geist-Regular.ttf", sha256: "85a1c6b18a6b0a06dfe9fd4f6d6a5d4979f74ec861eaef4bc7868b5492b8a117" },
  { url: fontRoot + "Geist-Bold.ttf", sha256: "3f21f02b827228c3f0c5fb230d027b5a1a263013618e8052bc1b3c5692812c88" },
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const defaultCache = path.join(tmpdir(), "torana-site-social-fonts");

// Public build inputs only. No font files are committed or copied to public/dist.
export async function loadFont(font, { cacheDir = defaultCache, fetchImpl = fetch } = {}) {
  assert.match(font.sha256, /^[a-f0-9]{64}$/);
  const filename = path.join(cacheDir, font.sha256 + ".ttf");
  let bytes;
  try { bytes = await readFile(filename); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (bytes) {
    assert.equal(hash(bytes), font.sha256, `Cached social font failed integrity check: ${filename}. Remove this cache file and retry.`);
    return bytes;
  }
  const response = await fetchImpl(font.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, "Could not download the pinned public social font");
  bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length <= 1_000_000, "Unexpected social font size");
  assert.equal(hash(bytes), font.sha256, "Downloaded social font failed integrity check");
  await mkdir(cacheDir, { recursive: true });
  const temporary = path.join(cacheDir, `${font.sha256}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
  return bytes;
}

let initialized;
export async function renderCard(svg, fontBuffers) {
  initialized ??= initWasm(readFile(new URL(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm"))));
  await initialized;
  const renderer = new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Geist", sansSerifFamily: "Geist" },
    fitTo: { mode: "original" },
  });
  try {
    assert.equal(renderer.width, 1200, "Social SVG must be 1200px wide");
    assert.equal(renderer.height, 630, "Social SVG must be 630px high");
    assert.equal(renderer.imagesToResolve().length, 0, "Social SVG cannot depend on external images");
    const rendered = renderer.render();
    try { return Buffer.from(rendered.asPng()); } finally { rendered.free(); }
  } finally { renderer.free(); }
}

export async function syncCards({
  directory = fileURLToPath(new URL("../public/social/", import.meta.url)),
  checkOnly = false,
  fontBuffers,
} = {}) {
  fontBuffers ??= await Promise.all(fonts.map(font => loadFont(font)));
  const entries = await readdir(directory);
  const sources = entries.filter(name => name.endsWith(".svg")).sort();
  assert.ok(sources.length > 0, "No social SVG sources found");
  const orphaned = entries.filter(name => name.endsWith(".png") && !sources.includes(name.replace(/\.png$/, ".svg")));
  assert.deepEqual(orphaned, [], "Every social PNG must have an SVG source");
  const stale = [];
  for (const source of sources) {
    const destination = source.replace(/\.svg$/, ".png");
    const png = await renderCard(await readFile(path.join(directory, source), "utf8"), fontBuffers);
    if (checkOnly) {
      let committed;
      try { committed = await readFile(path.join(directory, destination)); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!committed?.equals(png)) stale.push(destination);
    } else {
      await writeFile(path.join(directory, destination), png);
    }
  }
  assert.equal(stale.length, 0, `Stale or missing social PNGs: ${stale.join(", ")}. Run npm run social:build and commit the PNGs.`);
  return sources.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--check"), "Usage: node scripts/social-cards.mjs [--check]");
    const checking = args[0] === "--check";
    const count = await syncCards({ checkOnly: checking });
    console.log(`${checking ? "Verified" : "Rendered"} ${count} social PNGs from their SVG sources with pinned WASM and fonts.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
