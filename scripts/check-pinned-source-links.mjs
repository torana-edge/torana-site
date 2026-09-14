// Inspect rendered HTML, not Astro templates: source URLs may be interpolated.
// A pinned link must resolve in Git at that exact commit, never in the checkout's
// current working tree. CI supplies both repositories with fetch-depth: 0.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { headingAnchors } from "./check-edge-links.mjs";

const repositories = ["torana-edge", "torana-plugin-sdk"];

export function pinnedTarget(link) {
  // Match the original path before URL normalization can hide a ../ segment.
  const match = link.match(/^https:\/\/github\.com\/torana-edge\/(torana-edge|torana-plugin-sdk)\/blob\/([^/?#]+)(?:\/([^?#]*))?(?:\?[^#]*)?(?:#(.*))?$/);
  if (!match || match[2] === "main") return null; // main is checked separately.
  const [, repository, revision, encodedPath, encodedFragment = ""] = match;
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("source revision must be a full 40-character commit SHA");
  const relative = decodeURIComponent(encodedPath ?? "");
  if (!relative || relative.includes("\0") || relative.split(/[\\/]/).some(part => !part || part === "." || part === "..")) {
    throw new Error("source path must be a non-empty relative file path without traversal");
  }
  return { repository, revision, relative, fragment: decodeURIComponent(encodedFragment) };
}

function htmlFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.isFile() && file.endsWith(".html") ? [file] : [];
  });
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    // A partial clone must fail on an absent object, not fetch during the check.
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  });
}

export function checkPinnedLinks(checkouts, builtRoot = "dist") {
  const roots = {};
  // Both checkouts are mandatory, even if a broken build omits one repo's links.
  for (const repository of repositories) {
    if (!checkouts[repository]) throw new Error(`missing required ${repository} checkout`);
    const root = fs.realpathSync(checkouts[repository]);
    if (!fs.statSync(root).isDirectory() || fs.realpathSync(git(root, "rev-parse", "--show-toplevel").trim()) !== root) {
      throw new Error(`${repository} path must be a Git checkout root`);
    }
    roots[repository] = root;
  }
  const failures = [];
  const counts = Object.fromEntries(repositories.map(repository => [repository, 0]));
  const commits = new Set();
  const objects = new Map();
  for (const file of htmlFiles(builtRoot)) {
    const html = fs.readFileSync(file, "utf8");
    // Astro emits quoted hrefs; also accept the other valid HTML attribute forms.
    for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const link = (match[1] ?? match[2] ?? match[3]).replaceAll("&amp;", "&");
      try {
        const target = pinnedTarget(link);
        if (!target) continue;
        const { repository, revision, relative, fragment } = target;
        counts[repository] += 1;
        const root = roots[repository];
        const commitKey = `${repository}:${revision}`;
        if (!commits.has(commitKey)) {
          let type;
          try { type = git(root, "cat-file", "-t", revision).trim(); } catch {
            throw new Error(`commit ${revision} is unavailable in ${repository}; fetch the required history (CI uses fetch-depth: 0)`);
          }
          if (type !== "commit") throw new Error(`${revision} is a ${type}, not a commit`);
          commits.add(commitKey);
        }
        const object = `${revision}:${relative}`;
        const key = `${repository}:${object}`;
        if (!objects.has(key)) {
          let type;
          try { type = git(root, "cat-file", "-t", object).trim(); } catch {
            throw new Error(`${object} does not exist in ${repository} at the pinned commit`);
          }
          if (type !== "blob") throw new Error(`${object} is a ${type}, not a file`);
          objects.set(key, null);
        }
        if (!fragment) continue;
        if (!objects.get(key)) {
          const content = git(root, "cat-file", "blob", object);
          objects.set(key, { anchors: headingAnchors(content), lines: content.replace(/\r?\n$/, "").split(/\r?\n/).length });
        }
        const document = objects.get(key);
        const line = fragment.match(/^L([1-9]\d*)(?:-L([1-9]\d*))?$/);
        if (line) {
          const start = Number(line[1]);
          const end = Number(line[2] ?? line[1]);
          if (start <= end && end <= document.lines) continue;
        } else if (/\.md$/i.test(relative) && document.anchors.has(fragment)) continue;
        throw new Error(`${object} has no heading or line anchor #${fragment}`);
      } catch (error) {
        failures.push(`${file}: ${link}: ${error.message}`);
      }
    }
  }
  for (const repository of repositories) {
    if (counts[repository] === 0) failures.push(`no pinned ${repository} links found in built HTML; this check has stopped seeing what it guards`);
  }
  return { checked: Object.values(counts).reduce((sum, count) => sum + count, 0), failures };
}

export function main(args) {
  if (args.length < 2 || args.length > 3 || args.some(arg => arg.startsWith("--"))) {
    console.error("usage: check-pinned-source-links.mjs <torana-edge checkout> <torana-plugin-sdk checkout> [built HTML directory; default dist]");
    return 2;
  }
  try {
    const [edge, sdk, builtRoot] = args;
    const { checked, failures } = checkPinnedLinks({ "torana-edge": edge, "torana-plugin-sdk": sdk }, builtRoot);
    if (failures.length) throw new Error(failures.join("\n"));
    console.log(`checked ${checked} pinned Edge/SDK source link(s) in built HTML; all resolve at their exact commits`);
    return 0;
  } catch (error) {
    console.error(`cannot verify pinned source links: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
