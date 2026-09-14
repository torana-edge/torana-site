import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkLinks, edgeTarget, headingAnchors } from "./check-edge-links.mjs";

const repo = "https://github.com/torana-edge/torana-edge";
const checker = fileURLToPath(new URL("./check-edge-links.mjs", import.meta.url));

test("Markdown anchors follow rendered headings, not fenced code or raw markup", () => {
  const markdown = [
    "# Configure", "## Configure", "## Configure-1", "## Configure",
    "## **Go** and `Rust` [SDKs](https://example.com)", "## <em>Hello</em> &amp; café!",
    "Setext title\n------------", "```md\n# Not a heading\n```",
    "    # Nor is indented code", "<div>\n# Nor raw HTML\n</div>",
  ].join("\n\n");
  assert.deepEqual([...headingAnchors(markdown)], [
    "configure", "configure-1", "configure-1-1", "configure-2",
    "go-and-rust-sdks", "hello--café", "setext-title",
  ]);
});

test("root README and encoded main-file fragments resolve", () => {
  assert.deepEqual(edgeTarget(`${repo}#configuration`), { relative: "README.md", fragment: "configuration" });
  assert.deepEqual(edgeTarget(`${repo}/?tab=readme-ov-file#configure`), { relative: "README.md", fragment: "configure" });
  assert.deepEqual(edgeTarget(`${repo}/blob/main/docs/My%20Guide.md#caf%C3%A9`), { relative: "docs/My Guide.md", fragment: "café" });
  for (const url of [`${repo}/issues/1`, `${repo}/blob/other/README.md`, `${repo}-other/blob/main/README.md`, "https://example.com/torana-edge/torana-edge"]) assert.equal(edgeTarget(url), null);
  assert.throws(() => edgeTarget(`${repo}/blob/main/%2e%2e%2fsecret`), /escapes/);
  assert.throws(() => edgeTarget(`${repo}/blob/main/docs/%ZZ`), URIError);
});

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "torana-edge-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edge = path.join(root, "edge");
  const src = path.join(root, "src");
  mkdirSync(path.join(edge, "docs"), { recursive: true });
  mkdirSync(src);
  writeFileSync(path.join(edge, "README.md"), "# Torana\n\n## Quickstart\n");
  writeFileSync(path.join(edge, "docs/QUICKSTART.md"), "# Quickstart\n\n## Configure\n\n## Configure\n");
  const setLinks = links => writeFileSync(path.join(src, "index.astro"), links.map(url => `<a href="${url}">Link</a>`).join("\n"));
  setLinks([repo, `${repo}/blob/main/docs/QUICKSTART.md#configure`]);
  return { root, edge, src, setLinks };
}

test("complete checkout passes, including duplicate headings and line ranges", t => {
  const { edge, src, setLinks } = fixture(t);
  setLinks([repo, `${repo}/blob/main/docs/QUICKSTART.md#configure`, `${repo}/blob/main/docs/QUICKSTART.md#configure-1`, `${repo}/blob/main/README.md#L1-L3`]);
  assert.deepEqual(checkLinks(edge, src), { checked: 4, failures: [] });
});

test("missing files, missing README headings, bad lines and malformed fragments fail", t => {
  const { edge, src, setLinks } = fixture(t);
  const invalid = ["#configuration", "#L1", "/blob/main/docs/missing.md", "/blob/main/docs/QUICKSTART.md#not-there", "/blob/main/README.md#L999", "/blob/main/README.md#L3-L1", "/blob/main/README.md#%ZZ"];
  for (const target of invalid) {
    setLinks([`${repo}${target}`]);
    assert.ok(checkLinks(edge, src).failures.some(message => message.includes(`${repo}${target}`)), target);
  }
});

test("no guarded links fails instead of claiming success", t => {
  const { edge, src, setLinks } = fixture(t);
  setLinks([`${repo}/issues`]);
  assert.match(checkLinks(edge, src).failures.join("\n"), /no torana-edge links found/);
});

test("file links cannot follow a symlink outside the checkout", t => {
  const { root, edge, src, setLinks } = fixture(t);
  writeFileSync(path.join(root, "outside.md"), "# Secret\n");
  symlinkSync(path.join(root, "outside.md"), path.join(edge, "docs/outside.md"));
  setLinks([`${repo}/blob/main/docs/outside.md#secret`]);
  assert.match(checkLinks(edge, src).failures.join("\n"), /escapes/);
});

test("CLI keeps usage, missing checkout, optional skip, and broken checkout distinct", t => {
  const { root, edge, setLinks } = fixture(t);
  const run = args => spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: "utf8" });
  assert.equal(run([]).status, 2);
  assert.equal(run(["--typo", edge]).status, 2);
  const missing = path.join(root, "missing");
  const failed = run([missing]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /cannot verify/);
  const skipped = run(["--optional", missing]);
  assert.equal(skipped.status, 0);
  assert.match(skipped.stderr, /skipping \(--optional\)/);
  const valid = run([edge]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /all resolve/);
  setLinks([`${repo}#configuration`]);
  assert.equal(run(["--optional", edge]).status, 1, "optional only skips an absent checkout");
  rmSync(path.join(root, "src"), { recursive: true });
  assert.equal(run([edge]).status, 1, "missing source must not pass");
});
