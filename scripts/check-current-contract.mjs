import fs from "node:fs";
import path from "node:path";

const roots = ["src"];
const forbidden = [
  { pattern: /proto\/torana\/v1/g, reason: "the public protocol reference is ABI v2" },
  { pattern: /torana\.v1/g, reason: "customer-facing source must not name the removed ABI v1 package" },
  { pattern: /Rust SDK[^\n]*ABI v1/gi, reason: "the Rust SDK implements ABI v2" },
  { pattern: /any language that compiles to WASI/gi, reason: "WASI support alone is not a supported Torana SDK" },
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
