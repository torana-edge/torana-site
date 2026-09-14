// Compare the values rendered by the site with Edge's scaffold and its exact
// SDK source. Reading SDK main would check a different contract during releases.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function oneMatch(source, pattern, name) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`expected exactly one literal ${name}; inspect the upstream declaration`);
  return matches[0][1];
}

export function checkSDKDocs(edgeRoot, sdkRoot, metadataPath = "src/data/sdk.json") {
  const scaffold = fs.readFileSync(path.join(edgeRoot, "internal/plugincmd/plugincmd.go"), "utf8");
  const version = oneMatch(scaffold, /^\s*(?:const\s+)?ScaffoldSDKVersion\s*=\s*"([^"\r\n]+)"\s*(?:\/\/[^\r\n]*)?$/gm, "ScaffoldSDKVersion");
  const revision = oneMatch(scaffold, /^\s*(?:const\s+)?ScaffoldSDKRevision\s*=\s*"([a-f0-9]{40})"\s*(?:\/\/[^\r\n]*)?$/gm, "ScaffoldSDKRevision");
  const goMod = fs.readFileSync(path.join(edgeRoot, "go.mod"), "utf8");
  const hostVersion = oneMatch(goMod, /^\s*(?:require\s+)?github\.com\/torana-edge\/torana-plugin-sdk\s+(\S+)\s*(?:\/\/[^\r\n]*)?$/gm, "host SDK requirement");
  if (hostVersion !== version) throw new Error(`Edge scaffold ${version} differs from host SDK ${hostVersion}`);

  let abi;
  try {
    abi = execFileSync("git", ["-C", sdkRoot, "show", `${revision}:abi.go`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error(`cannot read abi.go at Edge SDK revision ${revision}; provide an SDK checkout containing that commit`);
  }
  const abiMajor = Number(oneMatch(abi, /^\s*const\s+ABIMajor\s+uint32\s*=\s*(\d+)\s*(?:\/\/[^\r\n]*)?$/gm, "ABIMajor"));
  const contractRevision = Number(oneMatch(abi, /^\s*const\s+ContractRevision\s+uint32\s*=\s*(\d+)\s*(?:\/\/[^\r\n]*)?$/gm, "ContractRevision"));
  const expected = { version, revision, abiMajor, contractRevision };
  const published = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const failures = Object.entries(expected)
    .filter(([key, value]) => published[key] !== value)
    .map(([key, value]) => `${key}: site publishes ${JSON.stringify(published[key])}, Edge requires ${JSON.stringify(value)}`);
  if (failures.length) throw new Error(`SDK documentation differs from the host:\n${failures.join("\n")}`);
  return expected;
}

export function main(args) {
  if (args.length !== 2 || args.some(arg => arg.startsWith("--"))) {
    console.error("usage: check-sdk-docs.mjs <torana-edge checkout> <torana-plugin-sdk checkout>");
    return 2;
  }
  try {
    const sdk = checkSDKDocs(...args);
    console.log(`SDK docs match Edge: ${sdk.version}, ${sdk.revision}, ABI major ${sdk.abiMajor}, contract revision ${sdk.contractRevision}`);
    return 0;
  } catch (error) {
    console.error(`cannot verify SDK docs: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
