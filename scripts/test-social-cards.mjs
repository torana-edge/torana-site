import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fonts, loadFont, renderCard, syncCards } from "./social-cards.mjs";

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "torana-social-test-"));
  t.after(() => rm(directory, { recursive: true }));
  return directory;
}

test("downloaded fonts and cache hits are integrity checked; failures cannot use a fallback", async t => {
  const cacheDir = await temporaryDirectory(t);
  const bytes = Buffer.from("test font input");
  const font = { url: "https://fonts.example/test.ttf", sha256: createHash("sha256").update(bytes).digest("hex") };
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, font.url);
    assert.equal(options.redirect, "error");
    return new Response(bytes);
  };
  assert.deepEqual(await loadFont(font, { cacheDir, fetchImpl }), bytes);
  assert.deepEqual(await loadFont(font, { cacheDir, fetchImpl }), bytes);
  assert.equal(calls, 1);
  await writeFile(path.join(cacheDir, font.sha256 + ".ttf"), "corrupt");
  await assert.rejects(loadFont(font, { cacheDir, fetchImpl }), /Cached social font failed integrity/);
  const fresh = await temporaryDirectory(t);
  await assert.rejects(loadFont(font, { cacheDir: fresh, fetchImpl: async () => new Response("different font") }), /Downloaded social font failed integrity/);
  await assert.rejects(loadFont(font, { cacheDir: fresh, fetchImpl: async () => new Response("unavailable", { status: 503 }) }), /Could not download/);
  await assert.rejects(loadFont(font, { cacheDir: fresh, fetchImpl: async () => { throw new Error("network unavailable"); } }), /network unavailable/);
  assert.deepEqual(await readdir(fresh), []);
});

test("concurrent cold-cache downloads publish complete identical files atomically", async t => {
  const cacheDir = await temporaryDirectory(t);
  const bytes = Buffer.from("shared public font input");
  const font = { url: "https://fonts.example/test.ttf", sha256: createHash("sha256").update(bytes).digest("hex") };
  const settings = { cacheDir, fetchImpl: async () => new Response(bytes) };
  const results = await Promise.all([loadFont(font, settings), loadFont(font, settings)]);
  for (const result of results) assert.deepEqual(result, bytes);
  assert.deepEqual(await readdir(cacheDir), [font.sha256 + ".ttf"]);
  assert.deepEqual(await readFile(path.join(cacheDir, font.sha256 + ".ttf")), bytes);
});

test("fresh renders match, stale text or raster bytes fail, and check mode never repairs them", async t => {
  const directory = await temporaryDirectory(t);
  const fontBuffers = await Promise.all(fonts.map(font => loadFont(font)));
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="white"/><text x="20" y="100" font-family="Geist" font-size="48">Original text</text></svg>';
  const svgFile = path.join(directory, "card.svg"), pngFile = path.join(directory, "card.png");
  await writeFile(svgFile, source);
  const settings = { directory, fontBuffers };
  await syncCards(settings);
  const originalPNG = await readFile(pngFile);
  await syncCards({ ...settings, checkOnly: true });
  assert.deepEqual(originalPNG, await renderCard(source, fontBuffers));
  await writeFile(svgFile, source.replace("Original text", "Changed text"));
  await assert.rejects(syncCards({ ...settings, checkOnly: true }), /Stale or missing social PNGs: card.png/);
  assert.deepEqual(await readFile(pngFile), originalPNG);
  await syncCards(settings);
  assert.notDeepEqual(await readFile(pngFile), originalPNG);
  await syncCards({ ...settings, checkOnly: true });
  await writeFile(pngFile, Buffer.from("corrupt PNG"));
  await assert.rejects(syncCards({ ...settings, checkOnly: true }), /Stale or missing/);
  await rm(pngFile);
  await assert.rejects(syncCards({ ...settings, checkOnly: true }), /Stale or missing/);
  await writeFile(path.join(directory, "orphan.png"), originalPNG);
  await assert.rejects(syncCards({ ...settings, checkOnly: true }), /Every social PNG must have an SVG/);
  await assert.rejects(renderCard(source.replace('width="1200"', 'width="100"'), fontBuffers), /1200px wide/);
});
