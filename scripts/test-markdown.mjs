import { test } from "node:test";
import assert from "node:assert/strict";
import { appendVaryAccept, prefersMarkdown } from "../src/lib/markdown-negotiation.mjs";
import { onRequest } from "../functions/_middleware.js";

test("Markdown negotiation honors explicit media ranges, q weights, wildcards and casing", () => {
  const cases = [
    ["text/markdown", true],
    ["TEXT/MARKDOWN", true],
    ["TEXT/MARKDOWN;Q=0.7, TEXT/HTML;Q=0.6", true],
    ["text/markdown; q=0.9, text/html; q=0.8", true],
    ["text/markdown;q=0., text/html;q=0.1", false],
    ["text/markdown;q=1., text/html;q=1.000", false],
    ["text/html, text/markdown; q=0.5", false],
    ["text/markdown; q=0, */*;q=1", false],
    ["text/markdown;q=0.9, text/*;q=1", false],
    ["text/*;q=0.9, text/markdown;q=1", true],
    ["*/*", false],
    ["application/json", false],
    ["", false],
  ];
  for (const [accept, expected] of cases) assert.equal(prefersMarkdown(accept), expected, accept);
});

test("Vary appends Accept once without disturbing existing dimensions", () => {
  const headers = new Headers({ Vary: "Origin, accept" });
  appendVaryAccept(headers);
  assert.equal(headers.get("Vary"), "Origin, accept");
  const empty = new Headers();
  appendVaryAccept(empty);
  assert.equal(empty.get("Vary"), "Accept");
});

test("Pages middleware negotiates page variants while preserving other routes and headers", async () => {
  const manifest = { "/": "/_markdown/index.md", "/special/": "/_markdown/special/index.md" };
  const calls = [];
  const env = { ASSETS: { fetch: async request => {
    calls.push(new URL(request.url).pathname);
    if (request.url.endsWith("routes.json")) return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } });
    if (request.url.endsWith("runtime-headers.json")) return new Response(JSON.stringify({
      "/": {
        "content-security-policy": "default-src 'self'",
        "content-signal": "ai-train=yes, search=yes, ai-input=yes",
      },
      "/special/": { "x-route-policy": "special" },
    }), { headers: { "Content-Type": "application/json" } });
    return new Response("---\ntitle: Test\n---\n\n# Test\n", { headers: { ETag: "sidecar" } });
  } } };
  const next = async () => new Response("<html>test</html>", {
    headers: {
      "Content-Type": "text/html; charset=utf-8", ETag: "html", "Last-Modified": "yesterday",
      "Content-Range": "bytes 0-40/100", "Accept-Ranges": "bytes", Vary: "Origin",
    },
  });
  const markdown = await onRequest({ request: new Request("https://torana.sh/", { headers: { Accept: "text/markdown" } }), env, next });
  assert.equal(markdown.status, 200);
  assert.equal(markdown.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(markdown.headers.get("Vary"), "Origin, Accept");
  assert.equal(markdown.headers.get("ETag"), null);
  assert.equal(markdown.headers.get("Last-Modified"), null);
  assert.equal(markdown.headers.get("Content-Range"), null);
  assert.equal(markdown.headers.get("Accept-Ranges"), null);
  assert.equal(markdown.headers.get("Content-Signal"), "ai-train=yes, search=yes, ai-input=yes");
  assert.match(await markdown.text(), /^---\ntitle: Test/);
  assert.deepEqual(calls, ["/_markdown/routes.json", "/_markdown/index.md", "/_markdown/runtime-headers.json"]);

  const html = await onRequest({ request: new Request("https://torana.sh/", { headers: { Accept: "text/html, text/markdown;q=0" } }), env, next });
  assert.equal(html.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(html.headers.get("Vary"), "Origin, Accept");
  assert.equal(await html.text(), "<html>test</html>");

  const asset = await onRequest({ request: new Request("https://torana.sh/theme.js", { headers: { Accept: "text/markdown" } }), env, next: async () => new Response("theme", { headers: { "Content-Type": "text/javascript" } }) });
  assert.equal(asset.headers.get("Content-Type"), "text/javascript");
  assert.equal(asset.headers.get("Vary"), null);

  const missing = await onRequest({ request: new Request("https://torana.sh/missing/", { headers: { Accept: "text/markdown" } }), env, next: async () => new Response("not found", { status: 404 }) });
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "not found");
  assert.equal(calls.length, 3);

  const conditional = await onRequest({ request: new Request("https://torana.sh/", {
    headers: { Accept: "text/markdown", "If-None-Match": "\"html\"" },
  }), env, next: async () => new Response(null, { status: 304, headers: { ETag: "html" } }) });
  assert.equal(conditional.status, 200);
  assert.notEqual(conditional.statusText, "Not Modified");
  assert.equal(conditional.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(conditional.headers.get("ETag"), null);
  assert.match(await conditional.text(), /^---\ntitle: Test/);

  const special = await onRequest({ request: new Request("https://torana.sh/special/", { headers: { Accept: "text/markdown" } }), env, next: async () => new Response("<html>special</html>") });
  assert.equal(special.headers.get("X-Route-Policy"), "special");
  assert.equal(special.headers.get("Content-Security-Policy"), null);
});
