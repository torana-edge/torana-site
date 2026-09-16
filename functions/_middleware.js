import { appendVaryAccept, prefersMarkdown } from "../src/lib/markdown-negotiation.mjs";
import { RUNTIME_HEADERS } from "./runtime-headers.js";

const MANIFEST_PATH = "/_markdown/routes.json";
const BODY_VARIANT_HEADERS = ["accept-ranges", "content-encoding", "content-length", "content-range", "etag", "last-modified", "transfer-encoding"];
let manifestPromise;

function htmlResponse(response, request) {
  const headers = new Headers(response.headers);
  appendVaryAccept(headers);
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function markdownManifest(env, requestURL) {
  if (!env?.ASSETS?.fetch) return {};
  if (!manifestPromise) {
    const url = new URL(MANIFEST_PATH, requestURL);
    manifestPromise = env.ASSETS.fetch(new Request(url)).then(async response => {
      if (!response.ok) return {};
      const value = await response.json();
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }).catch(() => ({}));
  }
  return manifestPromise;
}

export async function onRequest(context) {
  const { request, env } = context;
  const response = await context.next();
  const url = new URL(request.url);
  // A static asset may answer a conditional request with 304 (or a range
  // request with 206) before the middleware sees it. The Markdown sidecar is
  // a different representation, so those HTML body statuses cannot be reused
  // with an HTML ETag or Content-Range.
  if (!["GET", "HEAD"].includes(request.method) || ![200, 206, 304].includes(response.status)) return response;

  const manifest = await markdownManifest(env, request.url);
  const sidecarPath = manifest[url.pathname];
  if (typeof sidecarPath !== "string" || !sidecarPath.startsWith("/_markdown/")) return response;

  const html = htmlResponse(response, request);
  if (!prefersMarkdown(request.headers.get("Accept"))) return html;

  let markdown;
  try {
    const sidecarURL = new URL(sidecarPath, request.url);
    markdown = await env.ASSETS.fetch(new Request(sidecarURL, { method: request.method }));
  } catch {
    return html;
  }
  if (!markdown.ok) return html;

  const headers = new Headers(html.headers);
  for (const name of BODY_VARIANT_HEADERS) headers.delete(name);
  for (const [name, value] of Object.entries(RUNTIME_HEADERS)) headers.set(name, value);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  appendVaryAccept(headers);
  return new Response(request.method === "HEAD" ? null : markdown.body, {
    status: 200,
    headers,
  });
}
