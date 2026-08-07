import fs from "node:fs";
import path from "node:path";

const edgeRoot = path.resolve(process.argv[2]);
if (!fs.existsSync(edgeRoot)) throw new Error("usage: check-owned-content.mjs <torana-edge checkout>");

const quickstart = fs.readFileSync(path.join(edgeRoot, "docs/QUICKSTART.md"), "utf8");
const canonical = quickstart.match(/go install github\.com\/torana-edge\/torana-edge\/cmd\/torana@[^\s`]+/)?.[0];
if (!canonical) throw new Error("canonical install command not found in Edge quickstart");

const siteSource = fs.readFileSync("src/data/install.ts", "utf8");
const site = siteSource.match(/export const installCommand = "([^"]+)"/)?.[1];
if (site !== canonical) {
  throw new Error(`site install command ${JSON.stringify(site)} differs from Edge ${JSON.stringify(canonical)}`);
}
