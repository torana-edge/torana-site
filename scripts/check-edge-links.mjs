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
// A supplied path that is not there is an ERROR, not a skip: a check that
// exits 0 when it cannot see its subject is worse than none, because it
// reports success for work it did not do. Pass --optional to skip instead;
// CI does not, and must not.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const optional = args.includes("--optional");
const edgeRoot = args.find((a) => !a.startsWith("--"));

if (!edgeRoot) {
  console.error("usage: check-edge-links.mjs [--optional] <path to a torana-edge checkout>");
  process.exit(2);
}
if (!fs.existsSync(edgeRoot)) {
  // A path was supplied and is not there. That is a FAILURE, not a skip:
  // exiting 0 would be a green CI step reporting nothing, which is the exact
  // silent hole this check exists to close. If the checkout step is renamed
  // or removed, the build must say so.
  //
  // --optional exists for running this locally without a sibling checkout.
  // CI does not pass it, and must not.
  const message = `no torana-edge checkout at ${edgeRoot}`;
  if (optional) {
    console.error(`skipping (--optional): ${message}`);
    process.exit(0);
  }
  console.error(`cannot verify torana-edge links: ${message}`);
  process.exit(1);
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
