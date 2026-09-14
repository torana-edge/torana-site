import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(target) : target.endsWith(".html") ? [target] : [];
  });
}
test("built pages have working local links, fragments, and social images", () => {
  assert.ok(existsSync(root), "Run npm run build before npm test");
  const files = htmlFiles(root);
  assert.ok(files.length >= 9);
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    const base = new URL(path.relative(root, file), "https://torana.sh/");
    for (const [, attr, value] of html.matchAll(/\b(href|src|content)="([^"\n]+)"/g)) {
      if (attr === "content" && !value.startsWith("https://torana.sh/social/")) continue;
      if (/^(mailto:|data:)/.test(value)) continue;
      const url = new URL(value.replaceAll("&amp;", "&"), base);
      if (url.origin !== base.origin) continue;
      let target = path.join(root, decodeURIComponent(url.pathname));
      if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, "index.html");
      assert.ok(existsSync(target), `${file}: missing ${value}`);
      if (url.hash && target.endsWith(".html")) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert.ok(readFileSync(target, "utf8").includes(`id="${id}"`), `${file}: missing fragment ${value}`);
      }
    }
    assert.match(html, /property="og:image"/);
    assert.match(html.match(/<header\b[\s\S]*?<\/header>/)?.[0] || "", /id="theme-choice"/);
    assert.doesNotMatch(html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || "", /id="theme-choice"/);
  }
  for (const name of ["torana", "origin", "compaction"]) {
    const png = readFileSync(path.join(root, "social", `${name}.png`));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
  }
});

test("all registry entries expose source, install commands and capability details", () => {
  const registry = JSON.parse(readFileSync(path.join(root, "registry/v1/index.json"), "utf8"));
  const html = readFileSync(path.join(root, "plugins/index.html"), "utf8");
  for (const plugin of registry.plugins) {
    assert.ok(html.includes(`id="${plugin.name}"`));
    assert.ok(html.includes(`href="${plugin.source}"`));
    assert.ok(html.includes(`data-copy="./torana plugin install ${plugin.source}"`));
    for (const capability of plugin.capabilities) assert.ok(html.includes(capability));
  }
});

test("public copy and social-card sources keep the focus on the project", () => {
  assert.doesNotMatch(readdirSync(root, { recursive: true }).join("\n"), /\.(?:ttf|otf|woff2?)$/im,
    "Build-only social fonts must not be bundled into the website");
  const sources = [...htmlFiles(root), ...readdirSync(path.join(root, "social"))
    .filter(file => file.endsWith(".svg")).map(file => path.join(root, "social", file))];
  for (const file of sources) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\bAniket\b|github\.com\/projectescape\b/i,
      `${file}: personal branding belongs outside the project website`);
  }
  const origin = readFileSync(path.join(root, "blog/why-torana/index.html"), "utf8");
  assert.match(origin, /tool calls and MCP calls/i);
  assert.match(origin, /cheaper or local model/);
  assert.match(origin, /side-project fashion/);
  assert.match(origin, /over-engineered/);
  assert.match(origin, /Bring your workflow hacks/);
  const result = readFileSync(path.join(root, "blog/context-compaction-negative-result/index.html"), "utf8");
  assert.match(result, /I built a context compactor/);
  assert.match(result, /I stopped treating savings as the product promise/);
});
