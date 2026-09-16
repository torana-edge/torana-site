import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));

test("build emits one Markdown sidecar for each indexed HTML page and no chrome", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "_markdown/routes.json"), "utf8"));
  const routes = Object.keys(manifest);
  const expectedRoutes = [];
  const walk = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "_markdown") continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target, `${prefix}${entry.name}/`);
      else if (entry.name === "index.html") expectedRoutes.push(prefix ? `/${prefix}` : "/");
    }
  };
  walk(root);
  assert.deepEqual(routes.sort(), expectedRoutes.sort());
  const routesConfig = JSON.parse(readFileSync(path.join(root, "_routes.json"), "utf8"));
  assert.deepEqual(routesConfig.include.sort(), routes.slice().sort());
  assert.deepEqual(routesConfig.exclude, []);
  assert.ok(!routes.includes("/404/"));
  for (const sidecar of Object.values(manifest)) {
    const markdown = readFileSync(path.join(root, sidecar.slice(1)), "utf8");
    assert.match(markdown, /^---\n(?:title|description):/);
    assert.doesNotMatch(markdown, /<script|<style|class="nav"|theme-choice/);
    assert.doesNotMatch(markdown, /href="/);
    assert.doesNotMatch(markdown, /\]\(\//, "local links should be resolved against the page origin");
  }
  const home = readFileSync(path.join(root, "_markdown/index.md"), "utf8");
  assert.match(home, /^# .+$/m);
  assert.match(home, /\[[^\]]+\]\(https:\/\/torana\.sh\//);
  assert.match(home, /^- .+$/m);
  const docs = readFileSync(path.join(root, "_markdown/docs/index.md"), "utf8");
  assert.match(docs, /^\| .+ \| .+ \|$/m);
  assert.match(docs, /^\| --- \|/m);
  const quickstart = readFileSync(path.join(root, "_markdown/quickstart/index.md"), "utf8");
  assert.match(quickstart, /```[\s\S]*\n[\s\S]*\n```/);
  const how = readFileSync(path.join(root, "_markdown/how-it-works/index.md"), "utf8");
  assert.match(how, /^## .+$/m);
});
