import { test } from "node:test";
import assert from "node:assert/strict";
import { toMarkdown } from "../src/lib/markdown-converter.mjs";

const escapeHTML = value => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("pure HTML conversion preserves code, hierarchy, links, and accessible figures", () => {
  const code = [
    "{",
    '  "outer": {',
    '\t"inner": [1, 2],',
    "  }",
    "",
    "",
    "",
    '  "literal": "```",',
    '  "end": true',
    "}",
  ].join("\n");
  const backtickRun = "`".repeat(2);
  const html = [
    "<!doctype html><html><head><title>Fixture</title>",
    '<meta name="description" content="Description > remains parsed">',
    '</head><body><header class="nav">ignored</header>',
    '<main id="main"><article><header class="introduction"><h1>Heading</h1></header>',
    `<pre><code class="language-json">${escapeHTML(code)}</code></pre>`,
    "<ul><li>outer<ul><li>inner</li></ul></li></ul>",
    `<p><a href="../docs/(guide)?x=[1]">[label]</a><a href="/next">next</a> <code>${backtickRun}x${backtickRun}</code></p>`,
    '<figure><img src="../diagrams/flow.svg" alt="Flow diagram"><figcaption>Caption</figcaption></figure>',
    '<div title="quoted > attribute"><p>alpha &amp; omega</p></div>',
    "</article></main></body></html>",
  ].join("");

  const markdown = toMarkdown(html, "/docs/");
  const fence = "`".repeat(4);
  const inlineFence = "`".repeat(3);
  const expectedCodeBlock = `${fence}json\n${code}\n${fence}`;
  assert.match(markdown, /^# Heading$/m);
  assert.equal(markdown.includes(expectedCodeBlock), true);
  assert.match(markdown, /^- outer\n  - inner$/m);
  assert.match(markdown, new RegExp(`${escapeRegExp(inlineFence)} ${escapeRegExp(backtickRun)}x${escapeRegExp(backtickRun)} ${escapeRegExp(inlineFence)}`));
  assert.match(markdown, /\[\\\[label\\\]\]\(https:\/\/torana\.sh\/docs\/%28guide%29\?x=\[1\]\)/);
  assert.match(markdown, /\)\s+\[next\]\(https:\/\/torana\.sh\/next\)/);
  assert.match(markdown, /!\[Flow diagram\]\(https:\/\/torana\.sh\/diagrams\/flow\.svg\)/);
  assert.match(markdown, /Caption/);
  assert.match(markdown, /alpha & omega/);
  assert.doesNotMatch(markdown, /class="nav"|ignored|quoted > attribute/);
});
