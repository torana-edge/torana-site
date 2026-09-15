import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYAML } from "yaml";

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
  assert.ok(files.length >= 10);
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

test("homepage exposes named capabilities and registry-backed featured plugins", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const registry = JSON.parse(readFileSync(path.join(root, "registry/v1/index.json"), "utf8"));
  const capabilities = html.match(/<div class="capability-grid"[\s\S]*?<\/section>/)?.[0];
  assert.ok(capabilities);
  // Named markers identify capabilities, independent of headlines, element type,
  // or an unmarked article nested inside a panel. Duplicates still fail.
  const names = [...capabilities.matchAll(/\bdata-capability="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(names.sort(), ["community", "harness", "permissions", "shared-format", "wasm-sdk"],
    "Each platform capability must appear once; inspect missing or duplicate named panels");
  assert.match(capabilities, /href="\/plugins\/submit\/"/);
  const featured = [...html.matchAll(/\bdata-featured-plugin="([^"]+)"/g)].map(match => match[1]);
  assert.equal(featured.length, 3);
  assert.equal(new Set(featured).size, featured.length, "Featured examples must be distinct");
  for (const name of featured) assert.ok(registry.plugins.some(plugin => plugin.name === name));
});

test("homepage request diagram retains accessible labels and visual flow nodes", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const diagram = html.match(/<figure class="request-flow"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(diagram);
  assert.match(diagram, /aria-labelledby="request-flow-title"/);
  assert.match(diagram, /aria-describedby="request-flow-description"/);
  for (const id of ["request-flow-title", "request-flow-description"]) {
    assert.match(diagram, new RegExp(`<[^>]+\\bid="${id}"[^>]*>[^<]*\\S[^<]*<`), `${id} must name non-empty accessible text`);
  }
  assert.match(diagram, /class="machine-boundary"/);
  assert.match(diagram, /class="flow-node provider-node"/);
  assert.match(diagram, /<svg\b/);
  assert.doesNotMatch(diagram, /<pre\b/);
});

test("technical overview is discoverable and its request diagram has a local boundary", () => {
  const html = readFileSync(path.join(root, "how-it-works/index.html"), "utf8");
  const diagram = html.match(/<figure class="architecture"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(diagram, "The architecture must be available in static HTML");
  assert.match(diagram, /aria-labelledby="architecture-title"/);
  assert.match(diagram, /aria-describedby="architecture-description"/);
  for (const id of ["architecture-title", "architecture-description"]) {
    assert.match(diagram, new RegExp(`<[^>]+\\bid="${id}"[^>]*>[^<]*\\S[^<]*<`));
  }
  for (const node of ["local-boundary", "harness-node", "edge-node", "control-node", "upstream-node"]) {
    assert.match(diagram, new RegExp(`class="[^"]*\\b${node}\\b`));
  }
  assert.match(diagram, /<svg\b/);
  assert.doesNotMatch(diagram, /<canvas\b|<pre\b/);
  for (const route of ["index.html", "docs/index.html", "how-it-works/index.html"]) {
    const source = readFileSync(path.join(root, route), "utf8");
    for (const label of ["Primary", "Mobile"]) {
      const nav = source.match(new RegExp(`<nav[^>]*aria-label="${label}"[\\s\\S]*?<\\/nav>`))?.[0];
      assert.match(nav || "", /href="\/how-it-works\/"/);
    }
    if (route !== "how-it-works/index.html") {
      assert.match(source.match(/<main\b[\s\S]*?<\/main>/)?.[0] || "", /href="\/how-it-works\/"/);
    }
  }
});

test("bridge guide is discoverable from related pages", () => {
  for (const route of ["index.html", "docs/index.html", "quickstart/index.html", "how-it-works/index.html", "docs/support/index.html", "docs/plugin-authoring/index.html"]) {
    const html = readFileSync(path.join(root, route), "utf8");
    assert.match(html.match(/<main\b[\s\S]*?<\/main>/)?.[0] || "", /href="\/docs\/protocol-bridges\/(?:#[^"]*)?"/, route);
  }
});

test("plugin sharing links to a valid listing issue form", () => {
  const html = readFileSync(path.join(root, "plugins/submit/index.html"), "utf8");
  const templateName = "plugin-listing.yml";
  assert.ok(html.includes(`https://github.com/torana-edge/torana-site/issues/new?template=${templateName}`));
  const template = parseYAML(readFileSync(new URL(`../.github/ISSUE_TEMPLATE/${templateName}`, import.meta.url), "utf8"));
  assert.equal(template.name, "Plugin listing request");
  assert.deepEqual(template.labels, ["plugin-listing"], "Listing requests need a stable triage label, independent of their title");
  const fields = template.body.filter(field => field.id);
  assert.equal(new Set(fields.map(field => field.id)).size, fields.length);
  for (const id of ["plugin-name", "use-case", "source", "revision", "license", "installation", "permissions", "compatibility"]) {
    const field = fields.find(field => field.id === id);
    assert.equal(field?.validations?.required, true, `${id} must be required`);
    assert.ok(field.attributes.label);
  }
  assert.ok(fields.find(field => field.id === "publication").attributes.options.every(option => option.required));

});

test("website output does not bundle font assets", () => {
  assert.doesNotMatch(readdirSync(root, { recursive: true }).join("\n"), /\.(?:ttf|otf|woff2?)$/im,
    "Build-only social fonts must not be bundled into the website");
});
