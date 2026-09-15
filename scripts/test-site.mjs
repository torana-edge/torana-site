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
    assert.ok(html.includes(`href="https://github.com/torana-edge/torana-plugins/blob/main/plugins/${plugin.name}/README.md"`));
    assert.ok(html.includes(`data-copy="./torana plugin install ${plugin.source}"`));
    for (const capability of plugin.capabilities) assert.ok(html.includes(capability));
  }
});

// These assertions intentionally guard product claims. Recheck the implementation
// before changing them; they are not marketing-headline snapshots.
test("homepage product claims retain local operation and supported API/SDK boundaries", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Runs on your machine\. No cloud deployment or Torana account required/);
  assert.match(html, /supported OpenAI, Anthropic, and Gemini APIs/);
  assert.match(html, /Go or Rust/);
  assert.doesNotMatch(html, /nothing leaves your machine|any language/i);
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
  assert.ok(html.includes(`Browse all ${registry.plugins.length} plugins`));
  const featured = [...html.matchAll(/\bdata-featured-plugin="([^"]+)"/g)].map(match => match[1]);
  assert.equal(featured.length, 3);
  assert.equal(new Set(featured).size, featured.length, "Featured examples must be distinct");
  for (const name of featured) assert.ok(registry.plugins.some(plugin => plugin.name === name));
  assert.doesNotMatch(html, /canonical IR|git clone|go build/i);
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

test("technical overview explains consequential routing, stream and permission boundaries", () => {
  const html = readFileSync(path.join(root, "how-it-works/index.html"), "utf8");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const hook of ["run_before_request", "run_on_stream_chunk", "run_after_response", "run_on_http_request", "run_on_tick"]) {
    assert.ok(text.includes(hook), `Missing hook: ${hook}`);
  }
  assert.match(text, /Native routing stays within the same configured format/);
  assert.match(text, /opt-in protocol bridge/);
  assert.match(text, /same bridge\.client contract/);
  assert.match(text, /On native routes,.*auxiliary paths pass through/);
  assert.match(text, /Under any configured bridge, auxiliary APIs are not emulated or forwarded: they return 400, even when the client and upstream contracts match/);
  assert.match(text, /A mismatched protocol bridge cannot carry provider-specific signatures or cache breakpoints into an unrelated API/);
  assert.doesNotMatch(text, /does not translate an Anthropic request into an OpenAI request/);
  assert.match(text, /mutable=false.*no assembled message body/);
  assert.match(text, /already-sent bytes cannot be rewritten/);
  assert.match(text, /last accepted state/);
  assert.match(text, /terminates the stream/);
  assert.match(text, /signed-stream violation.*even in pass mode/);
  assert.match(text, /SHA-256 digest/);
  assert.match(text, /Every requested permission must be approved/);
  assert.match(text, /no ambient filesystem or network access/);
  assert.match(text, /System clocks are available/);
  assert.match(text, /approved HTTP and model host calls can send/i);
  assert.match(text, /Redis.*OpenTelemetry/);
  assert.match(text, /loopback-only/);
  assert.match(text, /cache hit into a miss/);
  assert.match(text, /stale signature/);
  assert.match(text, /inspected Edge and SDK source snapshots/);
  assert.match(text, /does not automatically track later changes on main/);
  assert.doesNotMatch(text, /nothing leaves your machine|guaranteed savings|any language/i);
  assert.doesNotMatch(html, /curl[^<]*\|[^<]*sh|torana (?:start|stop|status)/);
});

test("bridge guide is discoverable without changing the core plugin invitation", () => {
  for (const route of ["index.html", "docs/index.html", "quickstart/index.html", "how-it-works/index.html", "docs/support/index.html", "docs/plugin-authoring/index.html"]) {
    const html = readFileSync(path.join(root, route), "utf8");
    assert.match(html.match(/<main\b[\s\S]*?<\/main>/)?.[0] || "", /href="\/docs\/protocol-bridges\/(?:#[^"]*)?"/, route);
  }
  const home = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(home, /opt in to a bridge between supported client and model APIs/);
  assert.match(home, /Your harness still owns tool execution/);
});

test("bridge setup uses a valid provider entry and a revision-checked CLI workflow", () => {
  const html = readFileSync(path.join(root, "docs/protocol-bridges/index.html"), "utf8");
  const decode = value => value.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
  const snippet = name => {
    const content = html.match(new RegExp(`<pre\\b[^>]*data-example="${name}"[^>]*><code[^>]*>([\\s\\S]*?)<\\/code><\\/pre>`))?.[1];
    assert.ok(content, `Missing ${name}`);
    return decode(content);
  };
  const provider = JSON.parse(`{${snippet("bridge-provider")}}`)["local-messages"];
  assert.deepEqual(provider, {
    url: "http://127.0.0.1:8000", format: "openai", auth: { mode: "none" },
    bridge: { client: "anthropic", upstream: "openai-chat", model: "your-loaded-model" },
  });
  const request = snippet("bridge-request");
  assert.match(request, /http:\/\/127.0.0.1:8080\/provider\/local-messages\/v1\/messages/);
  const body = JSON.parse(request.match(/-d '([^']+)'/)?.[1] || "");
  assert.equal(body.max_tokens, 128);
  assert.equal(body.messages[0].role, "user");
  assert.doesNotMatch(request, /Authorization|api.key/i);
  const text = decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  for (const required of [
    "./torana config get > bridge-settings.json", "config.providers", "not a complete settings file",
    "./torana config apply --file bridge-settings.json --yes", "Preserve the other settings, the revision",
    "do not copy a new revision onto old settings", "Omitting the member preserves the existing bridge",
    "set its bridge member to null", "same checkout and evaluation data directory",
  ]) assert.ok(text.includes(required), required);
});

test("bridge documentation distinguishes translation coverage from native preservation and live harness proof", () => {
  for (const route of ["docs/protocol-bridges/index.html", "docs/support/index.html"]) {
    const html = readFileSync(path.join(root, route), "utf8");
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const protocol of ["openai-chat", "openai-responses", "anthropic", "gemini", "gemini-codeassist"]) assert.ok(text.includes(protocol));
    assert.match(text, /[Nn]o plugin is required/);
    assert.match(text, /20 cross-contract directions/);
    assert.match(text, /[Mm]ock/);
    assert.match(text, /caller credentials are not forwarded across families/i);
    assert.match(text, /not emulated or forwarded.*(?:return|they return) 400/);
    assert.match(text, /Under any configured bridge/);
    assert.match(text, /This includes bridges whose client and upstream contracts match/);
    assert.match(text, /previous_response_id/);
    assert.match(text, /400 before an upstream call/);
    assert.match(text, /without a success marker/);
    assert.doesNotMatch(text, /any harness|every harness works|universal compatibility/i);
  }
  const guide = readFileSync(path.join(root, "docs/protocol-bridges/index.html"), "utf8");
  assert.match(guide, /not proof that every live harness/);
  assert.match(guide, /Send complete conversation history/);
  const quickstart = readFileSync(path.join(root, "quickstart/index.html"), "utf8");
  assert.match(quickstart, /This is a native route/);
  assert.match(quickstart, /auxiliary APIs under any configured bridge return 400, even when the client and upstream contracts match/);
  const authoring = readFileSync(path.join(root, "docs/plugin-authoring/index.html"), "utf8");
  for (const field of ["instructions", "max_output_tokens", "temperature", "top_p", "provider_extensions_json"]) assert.ok(authoring.includes(field));
  assert.match(authoring, /native routes/);
  assert.match(authoring, /href="https:\/\/github\.com\/torana-edge\/torana-edge\/blob\/main\/docs\/UPGRADE_NOTES\.md"/);
  assert.match(authoring, /cache-prefix changes/);
  assert.match(authoring, /does not require an SDK pin change/);
});

test("plugin sharing has a real issue form and leaves installation permissioned", () => {
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
  assert.match(html, /not a security certification/);
  assert.match(html, /plugin install --official/);
  const installation = readFileSync(path.join(root, "docs/plugin-installation/index.html"), "utf8");
  assert.match(installation, /TORANA_DATA_DIR<\/code> alone does not select the plugin directory/);
  assert.match(installation, /refuses remote Rust source builds/);
  assert.match(installation, /does not approve its permissions or enable it/);
});

test("plugin authoring documents the current SDK pins and an explicit scenario workflow", () => {
  const sdk = JSON.parse(readFileSync(new URL("../src/data/sdk.json", import.meta.url), "utf8"));
  const authoring = readFileSync(path.join(root, "docs/plugin-authoring/index.html"), "utf8");
  const support = readFileSync(path.join(root, "docs/support/index.html"), "utf8");
  for (const html of [authoring, support]) {
    assert.ok(html.includes(`<code>${sdk.version}</code>`));
    assert.ok(html.includes(`ABI major ${sdk.abiMajor}, contract revision ${sdk.contractRevision}`));
    assert.match(html, /does not depend on crates\.io availability/);
    assert.doesNotMatch(html, /v0\.3\.0/);
  }
  assert.ok(authoring.includes(sdk.revision));
  assert.match(authoring, /\.\/torana plugin new \.\.\/my-go-plugin --language go/);
  assert.match(authoring, /\.\/torana plugin new \.\.\/my-rust-plugin --language rust/);
  assert.match(authoring, /source linter is Go-only/);
  assert.match(authoring, /scaffolding does not generate scenario files/);
  assert.match(authoring, /\.\/torana plugin test \.\.\/my-go-plugin --scenario/);
  assert.match(authoring, /This does not approve your installed copy/);
  for (const page of ["docs/index.html", "plugins/submit/index.html", "docs/support/index.html"]) {
    assert.ok(readFileSync(path.join(root, page), "utf8").includes('href="/docs/plugin-authoring/"'), `${page} must link to plugin authoring`);
  }
});

test("community listing policy limits review to a revision and allows removal", () => {
  // Policy changes, like product-claim changes, need deliberate review. These
  // checks do not snapshot headings or the invitation's marketing wording.
  const html = readFileSync(path.join(root, "plugins/submit/index.html"), "utf8");
  const template = parseYAML(readFileSync(new URL("../.github/ISSUE_TEMPLATE/plugin-listing.yml", import.meta.url), "utf8"));
  const introduction = template.body.filter(field => field.type === "markdown").map(field => field.attributes.value).join("\n");
  for (const surface of [html, introduction]) {
    assert.match(surface, /reviewed revision, not future branch updates/);
    assert.match(surface, /Maintainers may remove listings/);
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
