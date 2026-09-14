// Validate site links against CI's torana-edge checkout, including README
// fragments. GitHub returns 200 even for a nonexistent heading anchor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";

export function headingAnchors(markdown) {
  const anchors = new Set();
  const slugger = new GithubSlugger();
  function visit(node) {
    if (node.type === "heading") anchors.add(slugger.slug(toString(node, { includeHtml: false })));
    for (const child of node.children ?? []) visit(child);
  }
  visit(fromMarkdown(markdown));
  return anchors;
}

const EDGE = "/torana-edge/torana-edge";
export function edgeTarget(link) {
  const url = new URL(link);
  if (url.origin !== "https://github.com") return null;
  let relative;
  if (url.pathname === EDGE || url.pathname === `${EDGE}/`) relative = "README.md";
  else if (url.pathname.startsWith(`${EDGE}/blob/main/`)) relative = decodeURIComponent(url.pathname.slice(`${EDGE}/blob/main/`.length));
  else return null; // Issues, other repositories, and non-main refs are outside this check.
  if (relative.split(/[\\/]/).some(part => part === "..") || path.isAbsolute(relative)) throw new Error("link escapes the checkout");
  return { relative, fragment: decodeURIComponent(url.hash.slice(1)) };
}

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

export function checkLinks(edgeRoot, siteSource = "src") {
  const root = fs.realpathSync(edgeRoot);
  const failures = [];
  const documents = new Map();
  let checked = 0;
  for (const file of filesUnder(siteSource)) {
    const source = fs.readFileSync(file, "utf8");
    for (const [link] of source.matchAll(/https:\/\/github\.com\/torana-edge\/torana-edge(?=[/#?"'\s)>`]|$)[^"'\s)>`<]*/g)) {
      try {
        const target = edgeTarget(link);
        if (!target) continue;
        checked += 1;
        const { relative, fragment } = target;
        const fullPath = path.join(root, relative);
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) throw new Error(`${relative} does not exist as a file on main`);
        if (!fs.realpathSync(fullPath).startsWith(`${root}${path.sep}`)) throw new Error("target escapes the checkout");
        if (!fragment) continue;
        if (!documents.has(fullPath)) {
          const markdown = fs.readFileSync(fullPath, "utf8");
          documents.set(fullPath, { anchors: headingAnchors(markdown), lines: markdown.replace(/\r?\n$/, "").split(/\r?\n/).length });
        }
        const document = documents.get(fullPath);
        const line = fragment.match(/^L([1-9]\d*)(?:-L([1-9]\d*))?$/);
        if (line && new URL(link).pathname.startsWith(`${EDGE}/blob/main/`)) {
          const start = Number(line[1]);
          const end = Number(line[2] ?? line[1]);
          if (start <= end && end <= document.lines) continue;
        } else if (/\.md$/i.test(relative) && document.anchors.has(fragment)) continue;
        throw new Error(`${relative} has no heading or line anchor #${fragment}`);
      } catch (error) {
        failures.push(`${file}: ${link}: ${error.message}`);
      }
    }
  }
  if (checked === 0) failures.push("no torana-edge links found at all; this check has stopped seeing what it guards");
  return { checked, failures };
}

export function main(args) {
  const optional = args.includes("--optional");
  const paths = args.filter(arg => !arg.startsWith("--"));
  if (paths.length !== 1 || args.some(arg => arg.startsWith("--") && arg !== "--optional")) {
    console.error("usage: check-edge-links.mjs [--optional] <path to a torana-edge checkout>");
    return 2;
  }
  const [edgeRoot] = paths;
  if (!fs.existsSync(edgeRoot)) {
    console.error(`${optional ? "skipping (--optional)" : "cannot verify torana-edge links"}: no torana-edge checkout at ${edgeRoot}`);
    return optional ? 0 : 1;
  }
  try {
    if (!fs.statSync(edgeRoot).isDirectory()) throw new Error("checkout path is not a directory");
    const { checked, failures } = checkLinks(edgeRoot);
    if (failures.length) throw new Error(failures.join("\n"));
    console.log(`checked ${checked} link(s) into torana-edge; all resolve`);
    return 0;
  } catch (error) {
    console.error(`cannot verify torana-edge links: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
