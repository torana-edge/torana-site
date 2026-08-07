import { readFile } from "node:fs/promises";

const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
await readFile(new URL("../public/copy.js", import.meta.url), "utf8");

const csp = headers.split("\n").find((line) => line.includes("Content-Security-Policy:"));
if (!csp) throw new Error("public/_headers is missing Content-Security-Policy");
const scriptDirective = csp.split(";").find((part) => part.includes("script-src"));
if (!scriptDirective || !scriptDirective.includes("'self'") || scriptDirective.includes("'unsafe-inline'")) {
  throw new Error("script-src must allow self and forbid unsafe-inline");
}
if (!headers.includes("Strict-Transport-Security: max-age=31536000; includeSubDomains")) {
  throw new Error("public/_headers is missing the required HSTS policy");
}
if (!layout.includes('<script is:inline src="/copy.js"></script>')) {
  throw new Error("Layout must load the external copy helper");
}
for (const match of layout.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) throw new Error("Layout contains an inline script body");
}
