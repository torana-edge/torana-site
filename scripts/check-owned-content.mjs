import fs from "node:fs";
import path from "node:path";

const edgeRoot = path.resolve(process.argv[2]);
if (!fs.existsSync(edgeRoot)) throw new Error("usage: check-owned-content.mjs <torana-edge checkout>");

const quickstart = fs.readFileSync(path.join(edgeRoot, "docs/QUICKSTART.md"), "utf8");
const canonical = quickstart.match(/## Install the current pre-release\s+```bash\n([\s\S]*?)\n```/)?.[1]?.trim();
if (!canonical) throw new Error("canonical pre-release install block not found in Edge quickstart");

const siteSource = fs.readFileSync("src/data/install.ts", "utf8");
const site = siteSource.match(/export const installCommand = `([\s\S]*?)`;/)?.[1]?.trim();
if (site !== canonical) {
  throw new Error(`site install block ${JSON.stringify(site)} differs from Edge ${JSON.stringify(canonical)}`);
}

const support = fs.readFileSync("src/pages/docs/support.astro", "utf8");
const harness = fs.readFileSync(path.join(edgeRoot, "docs/HARNESS_COMPATIBILITY.md"), "utf8");
const caching = fs.readFileSync(path.join(edgeRoot, "docs/PROMPT_CACHING.md"), "utf8");

// The inference endpoints the platform decodes, in both directions: the Edge
// contract must still name each one, and the site matrix must not omit it.
//
// /converse and /converse-stream were Bedrock's and are gone with the adapter
// (torana-edge#344). They are removed here in lockstep — left in place, this
// list would have FORCED the site to keep advertising a format the platform no
// longer speaks, and would then have failed on the Edge side too once the
// removal landed. A hardcoded vocabulary that outlives what it describes stops
// being a guard and becomes an obstacle.
for (const endpoint of [
  "chat/completions",
  "/responses",
  "/messages",
  ":generateContent",
  ":streamGenerateContent",
]) {
  if (!harness.includes(endpoint)) throw new Error(`Edge harness contract no longer contains ${endpoint}`);
  if (!support.includes(endpoint)) throw new Error(`site support matrix omits ${endpoint}`);
}

// cachePoint was Bedrock's marker and goes with the same removal.
for (const cacheField of ["cache_control", "prompt_cache_key", "prompt_cache_retention", "cachedContent"]) {
  if (!caching.includes(cacheField)) throw new Error(`Edge prompt-cache contract no longer contains ${cacheField}`);
  if (!support.includes(cacheField)) throw new Error(`site support matrix omits ${cacheField}`);
}

if (!support.includes("Credentialed normal/tool/resume smoke remains a release gate")) {
  throw new Error("site support matrix must keep the credentialed harness release gate visible");
}
