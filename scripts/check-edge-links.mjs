// The site publishes deep links into torana-edge's documentation on `main`.
// Nothing verified them, so a file renamed in that repository turned a
// customer-facing link into a 404 with no warning on either side — which is
// what happened to the dogfood results when they were renamed off an internal
// issue number.
//
// CI already checks out torana-edge (see .github/workflows/ci.yml), so the
// link target is a file on disk and the check costs a stat. Usage:
//
//   node scripts/check-edge-links.mjs _sources/torana-edge
//
// Without that directory the check SKIPS rather than passes, because a check
// that silently succeeds when it cannot see its subject is worse than none.
import fs from "node:fs";
import path from "node:path";

const edgeRoot = process.argv[2];
if (!edgeRoot) {
  console.error("usage: check-edge-links.mjs <path to a torana-edge checkout>");
  process.exit(2);
}
if (!fs.existsSync(edgeRoot)) {
  console.error(`skipping: no torana-edge checkout at ${edgeRoot}`);
  process.exit(0);
}

// A deep link into a file on torana-edge's default branch.
const EDGE_BLOB = /https:\/\/github\.com\/torana-edge\/torana-edge\/blob\/main\/([^"'\s)>]+)/g;

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

const failures = [];
let checked = 0;
for (const file of filesUnder("src")) {
  const source = fs.readFileSync(file, "utf8");
  for (const [, target] of source.matchAll(EDGE_BLOB)) {
    checked += 1;
    // Strip a #fragment: the file is what this check can resolve.
    const relative = target.split("#")[0];
    if (!fs.existsSync(path.join(edgeRoot, relative))) {
      failures.push(`${file}: links to torana-edge/${relative}, which does not exist on main`);
    }
  }
}

if (checked === 0) {
  console.error("no torana-edge links found at all; this check has stopped seeing what it guards");
  process.exit(1);
}
if (failures.length > 0) {
  console.error(`broken links into torana-edge:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`checked ${checked} link(s) into torana-edge; all resolve`);
