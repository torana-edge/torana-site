import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { parse as parseYAML } from "yaml";
import { analyticsWebsiteId, analyticsHeaders } from "../src/lib/analytics-config.mjs";

const root = new URL("../dist/", import.meta.url);
const websiteId = analyticsWebsiteId(true, process.env.PUBLIC_ANALYTICS_ENABLED, process.env.PUBLIC_UMAMI_WEBSITE_ID);
const baseline = readFileSync(new URL("../src/config/security-headers.txt", import.meta.url), "utf8");
const pages = readdirSync(root, { recursive: true }).filter(name => name.endsWith(".html"));

test("every built page agrees with the explicit deployment config and generated CSP", () => {
  assert.ok(statSync(new URL("_headers", root)).isFile(), "Cloudflare requires a file at /_headers");
  const headers = readFileSync(new URL("_headers", root), "utf8");
  assert.equal(headers, analyticsHeaders(baseline, websiteId));
  for (const name of pages) {
    const html = readFileSync(new URL(name, root), "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*src="\/analytics.js"[^>]*><\/script>/g)];
    // A noindex response is not a destination: it claims no canonical URL and is
    // absent from the analytics page vocabulary, so it must carry no tracker.
    if (/<meta name="robots" content="noindex/.test(html)) {
      assert.equal(scripts.length, 0, `${name} is noindex and must not load the tracker`);
      assert.doesNotMatch(html, /rel="canonical"/, `${name} is noindex and must not claim a canonical URL`);
    } else if (websiteId) {
      assert.equal(scripts.length, 1, name);
      assert.ok(scripts[0][0].includes(`data-website-id="${websiteId}"`), name);
      const canonical = html.match(/rel="canonical" href="https:\/\/torana.sh([^"?#]*)"/)?.[1];
      assert.ok(canonical, name);
      assert.ok(scripts[0][0].includes(`data-page="${canonical}"`), name);
    } else {
      assert.equal(scripts.length, 0, name);
      assert.doesNotMatch(html, /data-website-id=/, name);
    }
    assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)="https:\/\/(?:cloud|gateway)\.umami\.is/, "Remote tracker must only load after browser privacy checks");
    assert.match(html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || "", /href="\/privacy\/"/);
  }
});

test("plugin install buttons expose the aggregate copy event marker", () => {
  const plugins = readFileSync(new URL("plugins/index.html", root), "utf8");
  const commands = [...plugins.matchAll(/<button\b[^>]*data-copy="[^"]+"[^>]*>/g)];
  assert.ok(commands.length > 0);
  assert.ok(commands.every(([tag]) => tag.includes('data-analytics-copy="plugin-install"')));
});

test("production uses repo variables while CI separately checks a fixed nonproduction fixture", () => {
  const deploy = parseYAML(readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"));
  const build = deploy.jobs.deploy.steps.find(step => step.run === "npm test");
  assert.deepEqual(build.env, {
    PUBLIC_ANALYTICS_ENABLED: "${{ vars.PUBLIC_ANALYTICS_ENABLED }}",
    PUBLIC_UMAMI_WEBSITE_ID: "${{ vars.PUBLIC_UMAMI_WEBSITE_ID }}",
  });
  const ci = parseYAML(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  const defaultBuild = ci.jobs.build.steps.find(step => step.run === "npm test");
  assert.equal(defaultBuild.env, undefined);
  const fixture = ci.jobs.build.steps.find(step => step.name === "Check the analytics-enabled fixture build");
  assert.equal(fixture.run, "npm run build && npm run test:built");
  assert.deepEqual(fixture.env, { PUBLIC_ANALYTICS_ENABLED: "true", PUBLIC_UMAMI_WEBSITE_ID: "00000000-0000-4000-8000-000000000001" });
  assert.ok(ci.jobs.build.steps.indexOf(defaultBuild) < ci.jobs.build.steps.indexOf(fixture));
  assert.doesNotMatch(JSON.stringify(ci), /vars\.PUBLIC_|pages deploy/);
});
