import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(projectRoot, "../dist");
const markdownRoot = path.join(distRoot, "_markdown");
const SITE = "https://torana.sh";
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const DROP_ELEMENTS = new Set(["script", "style", "noscript", "template", "svg"]);
const BLOCK_ELEMENTS = new Set(["address", "article", "aside", "blockquote", "div", "dl", "dt", "dd", "details", "figure", "figcaption", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "ul"]);

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot|nbsp);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "apos") return "'";
    if (lower === "gt") return ">";
    if (lower === "lt") return "<";
    if (lower === "quot") return '"';
    if (lower === "nbsp") return "\u00a0";
    const number = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : match;
  });
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function parseHTML(html) {
  const root = { type: "element", tag: "root", attributes: {}, children: [] };
  const stack = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>/g;
  let cursor = 0;
  const appendText = value => {
    if (value) stack.at(-1).children.push({ type: "text", value });
  };
  for (const token of html.matchAll(tokenPattern)) {
    appendText(html.slice(cursor, token.index));
    const source = token[0];
    cursor = token.index + source.length;
    if (source.startsWith("<!--") || source.startsWith("<!")) continue;
    if (source.startsWith("</")) {
      const tag = source.slice(2, -1).trim().toLowerCase();
      const index = stack.findLastIndex(node => node.tag === tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const selfClosing = /\/\s*>$/.test(source);
    const body = source.slice(1, source.length - (selfClosing ? 2 : 1)).trim();
    const tagMatch = /^([^\s/>]+)/.exec(body);
    if (!tagMatch) continue;
    const tag = tagMatch[1].toLowerCase();
    const node = { type: "element", tag, attributes: parseAttributes(body.slice(tagMatch[0].length)), children: [] };
    stack.at(-1).children.push(node);
    if (!selfClosing && !VOID_ELEMENTS.has(tag)) stack.push(node);
  }
  appendText(html.slice(cursor));
  return root;
}

function descendants(node, predicate) {
  const result = [];
  for (const child of node.children ?? []) {
    if (child.type === "element") {
      if (predicate(child)) result.push(child);
      result.push(...descendants(child, predicate));
    }
  }
  return result;
}

function firstDescendant(node, predicate) {
  return descendants(node, predicate)[0];
}

function textContent(node) {
  return (node.children ?? []).map(child => child.type === "text" ? decodeEntities(child.value) : textContent(child)).join("");
}

function cleanInline(value) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t\r\n]+/g, " ").trim();
}

function cleanBlock(value) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveLink(value, pageURL) {
  try { return new URL(value, pageURL).href; } catch { return value; }
}

function escapeTableCell(value) {
  return cleanInline(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function renderTable(node, pageURL) {
  const rows = descendants(node, child => child.tag === "tr").map(row =>
    row.children.filter(child => child.type === "element" && (child.tag === "th" || child.tag === "td")),
  ).filter(row => row.length);
  if (!rows.length) return "";
  const renderCell = cell => escapeTableCell(renderChildren(cell, pageURL, { inline: true }));
  const widths = Math.max(...rows.map(row => row.length));
  const normalized = rows.map(row => [...row, ...Array.from({ length: widths - row.length }, () => ({ type: "text", value: "" }))].map(renderCell));
  const hasHeader = rows[0].some(cell => cell.tag === "th");
  const header = hasHeader ? normalized.shift() : Array.from({ length: widths }, (_, index) => `Column ${index + 1}`);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...normalized.map(row => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderList(node, pageURL, depth = 0) {
  const items = node.children.filter(child => child.type === "element" && child.tag === "li");
  const ordered = node.tag === "ol";
  return items.map((item, index) => {
    const nested = item.children.filter(child => child.type === "element" && (child.tag === "ul" || child.tag === "ol"));
    const content = cleanBlock(item.children.filter(child => !nested.includes(child)).map(child => renderNode(child, pageURL)).join(""));
    const indent = "  ".repeat(depth);
    const prefix = `${indent}${ordered ? `${index + 1}.` : "-"} `;
    const lines = content ? content.split("\n") : [""];
    let output = lines.map((line, lineIndex) => lineIndex ? `${indent}  ${line}` : `${prefix}${line}`).join("\n");
    for (const child of nested) output += `\n${renderList(child, pageURL, depth + 1)}`;
    return output;
  }).join("\n");
}

function renderImage(node, pageURL) {
  const alt = cleanInline(node.attributes.alt ?? "");
  if (!alt) return "";
  const src = node.attributes.src ? resolveLink(node.attributes.src, pageURL) : "";
  return src ? `![${alt}](${src})` : alt;
}

function renderChildren(node, pageURL, options = {}) {
  let output = "";
  let lastRenderedNode;
  for (const child of node.children ?? []) {
    const rendered = renderNode(child, pageURL, options);
    if (!rendered) continue;
    // Astro's HTML minifier removes source whitespace between flex/grid
    // children. Re-introduce a word boundary for the plain-text variant while
    // keeping punctuation attached to the preceding word.
    if (output && lastRenderedNode && (lastRenderedNode.type === "element" || child.type === "element")
      && !/[\s\n]$/.test(output) && !/^[\s\n]/.test(rendered)
      && !/^[.,!?;:)\]}%]/.test(rendered) && !/[([{]$/.test(output)) output += " ";
    output += rendered;
    lastRenderedNode = child;
  }
  return output;
}

function renderNode(node, pageURL, options = {}) {
  if (node.type === "text") return options.pre ? decodeEntities(node.value) : decodeEntities(node.value).replace(/\s+/g, " ");
  const { tag, attributes } = node;
  if (DROP_ELEMENTS.has(tag)) return "";
  if (attributes.id === "copy-status" || attributes.class?.split(/\s+/).includes("skip")) return "";
  if (tag === "img") return renderImage(node, pageURL);
  if (tag === "br") return "\n";
  if (tag === "hr") return "\n\n---\n\n";
  if (tag === "a") {
    const label = cleanInline(renderChildren(node, pageURL, { inline: true }));
    const href = attributes.href ? resolveLink(attributes.href, pageURL) : "";
    return href ? `[${label || href}](${href})` : label;
  }
  if (tag === "strong" || tag === "b") return `**${cleanInline(renderChildren(node, pageURL, { inline: true }))}**`;
  if (tag === "em" || tag === "i") return `*${cleanInline(renderChildren(node, pageURL, { inline: true }))}*`;
  if (tag === "del" || tag === "s") return `~~${cleanInline(renderChildren(node, pageURL, { inline: true }))}~~`;
  if (tag === "code" && !attributes.class?.split(/\s+/).some(value => value.startsWith("language-"))) {
    const value = cleanInline(renderChildren(node, pageURL, { inline: true }));
    const fence = value.includes("`") ? "``" : "`";
    return `${fence}${value}${fence}`;
  }
  if (tag === "pre") {
    const code = firstDescendant(node, child => child.tag === "code");
    const value = code ? renderChildren(code, pageURL, { pre: true }) : textContent(node);
    const language = code?.attributes.class?.match(/(?:^|\s)language-([\w-]+)/)?.[1] ?? "";
    const fenceSize = Math.max(3, ...[...value.matchAll(/`+/g)].map(match => match[0].length + 1));
    const fence = "`".repeat(fenceSize);
    return `\n\n${fence}${language}\n${value.replace(/\n+$/, "")}\n${fence}\n\n`;
  }
  if (tag === "table") return `\n\n${renderTable(node, pageURL)}\n\n`;
  if (tag === "ul" || tag === "ol") return `\n\n${renderList(node, pageURL)}\n\n`;
  if (tag === "blockquote") {
    const value = cleanBlock(renderChildren(node, pageURL));
    return `\n\n${value.split("\n").map(line => `> ${line}`).join("\n")}\n\n`;
  }
  if (tag === "dt") return `\n\n**${cleanInline(renderChildren(node, pageURL, { inline: true }))}**\n\n`;
  if (tag === "dd") return `\n\n${cleanBlock(renderChildren(node, pageURL))}\n\n`;
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `\n\n${"#".repeat(level)} ${cleanInline(renderChildren(node, pageURL, { inline: true }))}\n\n`;
  }
  const value = renderChildren(node, pageURL, options);
  return BLOCK_ELEMENTS.has(tag) ? `\n\n${value}\n\n` : value;
}

function removeChrome(node) {
  node.children = (node.children ?? []).filter(child => {
    if (child.type !== "element") return true;
    if (DROP_ELEMENTS.has(child.tag)) return false;
    if (child.tag === "footer" || child.tag === "nav") return false;
    if (child.attributes.id === "copy-status" || child.attributes.class?.split(/\s+/).includes("skip")) return false;
    removeChrome(child);
    return true;
  });
}

function metadata(root) {
  const titleNode = firstDescendant(root, child => child.tag === "title");
  const description = firstDescendant(root, child => child.tag === "meta" && child.attributes.name?.toLowerCase() === "description");
  return { title: cleanInline(titleNode ? textContent(titleNode) : ""), description: cleanInline(description?.attributes.content ?? "") };
}

function yamlValue(value) {
  return JSON.stringify(value);
}

function toMarkdown(html, route) {
  const root = parseHTML(html);
  const main = firstDescendant(root, child => child.tag === "main" && child.attributes.id === "main");
  if (!main) throw new Error(`No #main content found for ${route}`);
  removeChrome(main);
  const pageURL = new URL(route, SITE).href;
  const body = cleanBlock(renderChildren(main, pageURL));
  const { title, description } = metadata(root);
  const frontmatter = [title && `title: ${yamlValue(title)}`, description && `description: ${yamlValue(description)}`].filter(Boolean);
  return `${frontmatter.length ? `---\n${frontmatter.join("\n")}\n---\n\n` : ""}${body}\n`;
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "_markdown") files.push(...await htmlFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
  }
  return files;
}

function routeForFile(file) {
  const relative = path.relative(distRoot, file).split(path.sep).join("/");
  if (relative === "404.html") return null;
  if (relative === "index.html") return "/";
  if (!relative.endsWith("/index.html")) return null;
  return `/${relative.slice(0, -"index.html".length)}`;
}

function headersFromRules(source) {
  const result = {};
  let global = false;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      global = line.trim() === "/*";
      continue;
    }
    if (!global) continue;
    const match = /^\s+([!#$%&'*+.^_`|~0-9A-Za-z-]+):\s*(.*)$/.exec(line);
    if (match && !match[1].startsWith("!")) result[match[1].toLowerCase()] = match[2];
  }
  return result;
}

async function writeRuntimeHeaders() {
  const source = await readFile(path.join(distRoot, "_headers"), "utf8");
  const headers = headersFromRules(source);
  const code = `// Generated by scripts/generate-markdown.mjs from dist/_headers.\nexport const RUNTIME_HEADERS = Object.freeze(${JSON.stringify(headers, null, 2)});\n`;
  await writeFile(path.resolve(projectRoot, "../functions/runtime-headers.js"), code);
}

const files = await htmlFiles(distRoot);
const routes = {};
await mkdir(markdownRoot, { recursive: true });
for (const file of files) {
  const route = routeForFile(file);
  if (!route) continue;
  const relative = route === "/" ? "index.md" : `${route.slice(1)}index.md`;
  const target = path.join(markdownRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, toMarkdown(await readFile(file, "utf8"), route));
  routes[route] = `/_markdown/${relative}`;
}
await writeFile(path.join(markdownRoot, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`);
await writeFile(path.join(distRoot, "_routes.json"), `${JSON.stringify({ version: 1, include: Object.keys(routes), exclude: [] }, null, 2)}\n`);
await writeRuntimeHeaders();
console.log(`Generated ${Object.keys(routes).length} Markdown page variants.`);
