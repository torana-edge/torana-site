import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";
import { chromium } from "playwright-core";
import { headersForURL } from "./verify-cloudflare-deployment.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const widths = [320, 375, 414, 671, 672, 768, 1024, 1280, 1920];
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
let server, browser, origin;

before(async () => {
  const headers = await readFile(resolve(root, "_headers"), "utf8");
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      const path = decodeURIComponent(url.pathname);
      const file = resolve(root, `.${path}${path.endsWith("/") ? "index.html" : ""}`);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(file);
      for (const [name, value] of Object.entries(headersForURL(headers, url))) {
        if (value !== null) response.setHeader(name, value);
      }
      response.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  // CI uses the pinned Chromium download; local QA can use installed Chrome.
  browser = await chromium.launch({ ...(process.env.DIAGRAM_BROWSER_CHANNEL && { channel: process.env.DIAGRAM_BROWSER_CHANNEL }) });
});

after(async () => {
  try { await browser?.close(); }
  finally { if (server) await new Promise(resolve => server.close(resolve)); }
});

async function withPage(width, theme, run) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
  try {
    // Layout must work with fallback fonts, offline. Never emit real analytics.
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await run(page);
  } finally { await context.close(); }
}

async function box(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `Exactly one ${selector}`);
  const result = await locator.boundingBox();
  assert.ok(result?.width > 0 && result.height > 0, `${selector} is visible`);
  return result;
}

const center = (rect, axis) => axis === "x" ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
function aligned(a, b, axis, label) {
  assert.ok(Math.abs(center(a, axis) - center(b, axis)) <= 1, `${label}: ${axis} centers differ (${center(a, axis)} vs ${center(b, axis)})`);
}
function between(rect, before, after, axis, label) {
  const size = axis === "x" ? "width" : "height";
  assert.ok(rect[axis] >= before[axis] + before[size] - 1 && rect[axis] + rect[size] <= after[axis] + 1,
    `${label} must stay in the gap between its nodes`);
}
async function fits(page, selector) {
  const issues = await page.locator(selector).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll("*")].filter(child => !child.closest(".sr-only, svg")).flatMap(child => {
      const rect = child.getBoundingClientRect();
      const overflow = rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || child.scrollWidth > child.clientWidth + 1;
      return overflow ? [child.className || child.tagName] : [];
    });
  });
  assert.deepEqual(issues, [], `${selector} must not overflow, including its labels`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow");
}

async function checkHomepage(page) {
  const machine = await box(page, ".machine-boundary");
  const agent = await box(page, ".agent-node");
  const proxy = await box(page, ".proxy-node");
  const provider = await box(page, ".provider-node");
  const internal = await box(page, ".machine-boundary > .connector svg");
  const upstream = await box(page, ".provider-connector svg");
  const label = await box(page, ".provider-connector span");
  aligned(internal, proxy, "x", "Agent/proxy connector");
  aligned(upstream, machine, "x", "Upstream connector (not the combined arrows + label)");
  aligned(upstream, provider, "x", "Provider connector");
  between(internal, agent, proxy, "y", "Agent/proxy connector");
  between(upstream, machine, provider, "y", "Upstream connector");
  assert.ok(label.x >= upstream.x + upstream.width, "Request/response label stays beside the arrows");
  aligned(label, upstream, "y", "Request/response label");
  await fits(page, ".request-flow");
}

async function checkTechnical(page) {
  const harness = await box(page, ".harness-node");
  const edge = await box(page, ".edge-node");
  const provider = await box(page, ".upstream-node");
  const boundary = await box(page, ".local-boundary");
  const internal = await box(page, ".local-path > .connector svg");
  const upstream = await box(page, ".upstream-connector svg");
  const control = await box(page, ".control-node");
  const controlArrow = await box(page, ".control-node svg");
  const controlLabel = await box(page, ".control-node strong");
  aligned(controlArrow, edge, "x", "Control-plane branch");
  between(controlArrow, edge, controlLabel, "y", "Control-plane branch");
  assert.ok(control.y + control.height <= boundary.y + boundary.height, "Local controls stay inside the machine");
  if (await page.evaluate(() => matchMedia("(min-width: 42rem)").matches)) {
    for (const rect of [harness, provider, internal, upstream]) aligned(rect, edge, "y", "Shared inference row");
    between(internal, harness, edge, "x", "Harness/Edge connector");
    between(upstream, boundary, provider, "x", "Provider connector");
  } else {
    for (const rect of [harness, provider, internal, upstream]) aligned(rect, edge, "x", "Stacked inference path");
    between(internal, harness, edge, "y", "Harness/Edge connector");
    between(upstream, boundary, provider, "y", "Provider connector");
  }
  await fits(page, ".architecture");
}

for (const theme of ["light", "dark"]) {
  for (const width of widths) {
    test(`diagrams align at ${width}px in ${theme} mode`, { timeout: 30_000 }, async () => {
      await withPage(width, theme, async page => {
        await page.goto(origin);
        await checkHomepage(page);
        await page.goto(`${origin}/how-it-works/`);
        await checkTechnical(page);
      });
    });
  }
}

test("technical row alignment follows changing content heights", { timeout: 30_000 }, async () => {
  await withPage(1024, "light", async page => {
    await page.goto(`${origin}/how-it-works/`);
    await page.locator(".edge-node p").evaluate(element => { element.textContent += " A longer description wraps onto additional lines without moving the inference path off axis."; });
    await page.locator(".control-node span").evaluate(element => { element.textContent += " Extra control details should not push the provider or its connector away from Torana."; });
    await checkTechnical(page);
    await page.locator(".upstream-node p").evaluate(element => { element.textContent += " A provider with its own much longer description can also become the tallest node on this row; the arrows must remain centered on all three nodes."; });
    await checkTechnical(page);
  });
});
