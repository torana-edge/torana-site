import { readFile } from "node:fs/promises";

const headers = await readFile(new URL("../src/config/security-headers.txt", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
await readFile(new URL("../public/copy.js", import.meta.url), "utf8");
await readFile(new URL("../public/theme.js", import.meta.url), "utf8");
if (!layout.includes('<script is:inline src="/theme.js"></script>')) {
  throw new Error("Layout must load the same-origin theme initializer before body paint");
}

const csp = headers.split("\n").find((line) => line.includes("Content-Security-Policy:"));
if (!csp) throw new Error("security-headers.txt is missing Content-Security-Policy");
const scriptDirective = csp.split(";").find((part) => part.includes("script-src"));
if (!scriptDirective || !scriptDirective.includes("'self'") || scriptDirective.includes("'unsafe-inline'")) {
  throw new Error("script-src must allow self and forbid unsafe-inline");
}
// Product policy: production may use Cloudflare Web Analytics. This is not a
// general security-header requirement and should be removed if that product is.
if (!scriptDirective.includes("https://static.cloudflareinsights.com")) {
  throw new Error("script-src must allow Cloudflare Web Analytics injected at the production edge");
}
if (!headers.includes("Strict-Transport-Security: max-age=31536000; includeSubDomains")) {
  throw new Error("security-headers.txt is missing the required HSTS policy");
}
if (!layout.includes('<script is:inline src="/copy.js"></script>')) {
  throw new Error("Layout must load the external copy helper");
}
for (const match of layout.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) throw new Error("Layout contains an inline script body");
}
