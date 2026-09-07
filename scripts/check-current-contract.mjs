import fs from "node:fs";
import path from "node:path";

const roots = ["src"];
// This guard exists to stop the customer-facing site naming a contract the
// platform does not ship. It had come to enforce the opposite: it forbade
// `torana.v1` as "the removed ABI v1 package" and demanded ABI v2, while the
// SDK ships `package torana.v1` from `proto/torana/v1/torana.proto` and its
// README reads "Plugin ABI v1". v2 was a working name during a rewrite and was
// retired. So the site could not be corrected to the truth without failing its
// own build — a guard pointed backwards is worse than no guard, because it
// argues with whoever tries to fix the page.
const forbidden = [
  { pattern: /proto\/torana\/v2/g, reason: "the public protocol reference is ABI v1 (proto/torana/v1)" },
  { pattern: /torana\.v2/g, reason: "customer-facing source must not name the retired ABI v2 package" },
  { pattern: /ABI v2/g, reason: "the shipped contract is ABI v1; ABI v2 was a working name that was retired" },
  { pattern: /any language that compiles to WASI/gi, reason: "WASI support alone is not a supported Torana SDK" },
  { pattern: /bedrock/gi, reason: "the Bedrock adapter was removed; it could never reach real AWS" },
];

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

const failures = [];
for (const file of roots.flatMap(filesUnder)) {
  const source = fs.readFileSync(file, "utf8");
  for (const { pattern, reason } of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) failures.push(`${file}: ${reason}`);
  }
}

if (failures.length > 0) {
  throw new Error(`stale customer contract:\n${failures.join("\n")}`);
}
