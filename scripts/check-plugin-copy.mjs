import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateCopy(registry, copy) {
  const names = registry.plugins.map(plugin => plugin.name).sort();
  if (JSON.stringify(Object.keys(copy).sort()) !== JSON.stringify(names)) {
    throw new Error("presentation copy must match the generated catalogue exactly");
  }
  for (const name of names) {
    const entry = copy[name];
    for (const key of ["title", "description"]) {
      if (typeof entry[key] !== "string" || !entry[key].trim() || entry[key].length > (key === "title" ? 100 : 320)) {
        throw new Error(name + ": missing or oversized " + key);
      }
    }
    const expected = "https://github.com/torana-edge/torana-plugins/blob/main/plugins/" + name + "/README.md";
    if (entry.guide !== expected) throw new Error(name + ": setup guide must point to its owning plugin");
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(fs.readFileSync("public/registry/v1/index.json", "utf8"));
  const copy = JSON.parse(fs.readFileSync("src/data/plugin-copy.json", "utf8"));
  validateCopy(registry, copy);
  console.log("Catalogue presentation copy matches all " + registry.plugins.length + " plugins.");
}
