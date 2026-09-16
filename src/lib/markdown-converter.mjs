import { parse } from "node-html-parser";
import { NodeHtmlMarkdown } from "node-html-markdown";

const SITE = "https://torana.sh";
const CHROME_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "nav",
  "footer",
  "header.nav",
  "#copy-status",
  ".skip",
];
const INLINE_BOUNDARY_TAGS = new Set(["A", "B", "CODE", "DEL", "EM", "I", "S", "SMALL", "SPAN", "STRONG"]);

// Keep this converter deliberately pure: build code and synthetic tests both
// pass rendered HTML in and receive the Markdown representation out. The
// maintained HTML parser handles quoted attributes, raw text, and entities;
// the site-specific rules only select the article and remove presentation
// chrome.
function makeConverter(codeFence) {
  return new NodeHtmlMarkdown({
    codeFence,
    codeBlockStyle: "fenced",
    bulletMarker: "-",
    useInlineLinks: true,
    // Disable the optional global newline cap: it would also rewrite meaningful
    // blank lines inside fenced code. The library's block translators still
    // supply normal paragraph spacing outside code blocks.
    maxConsecutiveNewlines: 0,
  });
}

function codeFenceFor(main) {
  const longest = Math.max(0, ...[...main.textContent.matchAll(/`+/g)].map(match => match[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

/*
 * The fence is selected per page so a code sample containing backticks cannot
 * terminate its own fenced block. Inline code delimiters remain library-
 * managed and are independently expanded around inline backtick runs.
 */
function translate(main) {
  return makeConverter(codeFenceFor(main)).translate(main.toString());
}

function cleanMetadata(value) {
  return value.replace(/\s+/g, " ").trim();
}

function resolveURL(value, pageURL) {
  try {
    return new URL(value, pageURL).href;
  } catch {
    return value;
  }
}

function absolutizeLinks(main, pageURL) {
  for (const node of main.querySelectorAll("a[href], img[src]")) {
    const attribute = node.tagName === "A" ? "href" : "src";
    const value = node.getAttribute(attribute);
    if (value) node.setAttribute(attribute, resolveURL(value, pageURL));
  }
}

function insertInlineBoundaries(node) {
  if (["PRE", "CODE"].includes(node.tagName)) return;
  const children = node.childNodes ?? [];
  for (let index = 1; index < children.length; index++) {
    const previous = children[index - 1];
    const current = children[index];
    if (INLINE_BOUNDARY_TAGS.has(previous.tagName) && INLINE_BOUNDARY_TAGS.has(current.tagName)) {
      current.insertAdjacentHTML("beforebegin", " ");
    }
  }
  for (const child of children) {
    if (child.tagName) insertInlineBoundaries(child);
  }
}

function removeChrome(main) {
  for (const selector of CHROME_SELECTORS) {
    for (const node of main.querySelectorAll(selector)) node.remove();
  }
}

function preserveTableBreaks(main) {
  // The maintained converter intentionally omits <br> from its table-cell
  // translator. Encode it as literal Markdown table-cell HTML so adjacent
  // inline values do not silently concatenate.
  for (const node of main.querySelectorAll("td br, th br")) node.replaceWith("&lt;br&gt;");
}

function frontmatter(document) {
  const title = cleanMetadata(document.querySelector("title")?.textContent ?? "");
  const description = cleanMetadata(document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "");
  const lines = [];
  if (title) lines.push(`title: ${JSON.stringify(title)}`);
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n` : "";
}

export function toMarkdown(html, route = "/") {
  const document = parse(html);
  const main = document.querySelector("main#main");
  if (!main) throw new Error(`No #main content found for ${route}`);
  const pageURL = new URL(route, SITE).href;
  removeChrome(main);
  preserveTableBreaks(main);
  absolutizeLinks(main, pageURL);
  insertInlineBoundaries(main);
  const body = translate(main).trim();
  return `${frontmatter(document)}${body}\n`;
}
