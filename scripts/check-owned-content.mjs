import fs from "node:fs";
import path from "node:path";

const edgeRoot = path.resolve(process.argv[2]);
if (!fs.existsSync(edgeRoot)) throw new Error("usage: check-owned-content.mjs <torana-edge checkout>");

const quickstart = fs.readFileSync(path.join(edgeRoot, "docs/QUICKSTART.md"), "utf8");
const canonical = quickstart.match(/go install github\.com\/torana-edge\/torana-edge\/cmd\/torana@[^\s`]+/)?.[0];
if (!canonical) throw new Error("canonical install command not found in Edge quickstart");

const siteSource = fs.readFileSync("src/data/install.ts", "utf8");
const site = siteSource.match(/export const installCommand = "([^"]+)"/)?.[1];
if (site !== canonical) {
  throw new Error(`site install command ${JSON.stringify(site)} differs from Edge ${JSON.stringify(canonical)}`);
}

const support = fs.readFileSync("src/pages/docs/support.astro", "utf8");
const harness = fs.readFileSync(path.join(edgeRoot, "docs/HARNESS_COMPATIBILITY.md"), "utf8");
const caching = fs.readFileSync(path.join(edgeRoot, "docs/PROMPT_CACHING.md"), "utf8");

for (const endpoint of [
  "chat/completions",
  "/responses",
  "/messages",
  "/converse",
  "/converse-stream",
  ":generateContent",
  ":streamGenerateContent",
]) {
  if (!harness.includes(endpoint)) throw new Error(`Edge harness contract no longer contains ${endpoint}`);
  if (!support.includes(endpoint)) throw new Error(`site support matrix omits ${endpoint}`);
}

for (const cacheField of ["cache_control", "cachePoint", "prompt_cache_key", "prompt_cache_retention", "cachedContent"]) {
  if (!caching.includes(cacheField)) throw new Error(`Edge prompt-cache contract no longer contains ${cacheField}`);
  if (!support.includes(cacheField)) throw new Error(`site support matrix omits ${cacheField}`);
}

if (!support.includes("Credentialed normal/tool/resume smoke remains a release gate")) {
  throw new Error("site support matrix must keep the credentialed harness release gate visible");
}
