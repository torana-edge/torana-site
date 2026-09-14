import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { checkSDKDocs } from "./check-sdk-docs.mjs";

const checker = fileURLToPath(new URL("./check-sdk-docs.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "torana-sdk-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edge = path.join(root, "edge");
  const sdk = path.join(root, "sdk");
  const metadata = path.join(root, "src/data/sdk.json");
  const scaffold = path.join(edge, "internal/plugincmd/plugincmd.go");
  mkdirSync(path.dirname(scaffold), { recursive: true });
  mkdirSync(path.dirname(metadata), { recursive: true });
  mkdirSync(sdk);
  const git = args => execFileSync("git", ["-C", sdk, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "-q"]);
  let commits = 0;
  const commitSDK = (abiMajor = 1, contractRevision = 1) => {
    writeFileSync(path.join(sdk, "abi.go"), `package plugin_sdk\n// fixture commit ${++commits}\nconst ABIMajor uint32 = ${abiMajor}\nconst ContractRevision uint32 = ${contractRevision}\n`);
    git(["add", "abi.go"]);
    git(["-c", "user.name=SDK docs test", "-c", "user.email=sdk-docs@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "SDK fixture"]);
    return git(["rev-parse", "HEAD"]);
  };
  const current = { version: "v0.5.0", revision: commitSDK(), abiMajor: 1, contractRevision: 1 };
  const setHost = (changes = {}) => {
    const sdk = { ...current, ...changes };
    writeFileSync(scaffold, `package plugincmd\nconst (\n ScaffoldSDKVersion = "${sdk.version}"\n ScaffoldSDKRevision = "${sdk.revision}"\n)\n`);
    writeFileSync(path.join(edge, "go.mod"), `module example.invalid/edge\nrequire (\n github.com/torana-edge/torana-plugin-sdk ${sdk.version}\n)\n`);
  };
  const publish = (changes = {}) => writeFileSync(metadata, JSON.stringify({ ...current, ...changes }));
  setHost();
  publish();
  return { root, edge, sdk, metadata, scaffold, current, setHost, publish, commitSDK, check: () => checkSDKDocs(edge, sdk, metadata) };
}

test("SDK docs match the pinned commit even when SDK HEAD and its worktree have moved", t => {
  const f = fixture(t);
  f.commitSDK(2, 3);
  writeFileSync(path.join(f.sdk, "abi.go"), "uncommitted SDK changes must not supply the host contract\n");
  assert.deepEqual(f.check(), f.current);
});

test("an upstream-only SDK version update fails unchanged site metadata", t => {
  const f = fixture(t);
  f.setHost({ version: "v0.6.0" });
  assert.throws(f.check, /version: site publishes "v0\.5\.0", Edge requires "v0\.6\.0"/);
});

test("an upstream-only Rust revision update fails even when its ABI stays the same", t => {
  const f = fixture(t);
  f.setHost({ revision: f.commitSDK() });
  assert.throws(f.check, /revision: site publishes/);
});

test("updating the Git pin alone cannot hide stale ABI major or contract revision", t => {
  const f = fixture(t);
  const revision = f.commitSDK(2, 3);
  f.setHost({ revision });
  f.publish({ revision });
  assert.throws(f.check, error => {
    assert.match(error.message, /abiMajor: site publishes 1, Edge requires 2/);
    assert.match(error.message, /contractRevision: site publishes 1, Edge requires 3/);
    return true;
  });
});

test("a scaffold that differs from the host's Go module requirement fails", t => {
  const f = fixture(t);
  writeFileSync(path.join(f.edge, "go.mod"), "require github.com/torana-edge/torana-plugin-sdk v0.6.0\n");
  assert.throws(f.check, /Edge scaffold v0\.5\.0 differs from host SDK v0\.6\.0/);
});

test("missing commits and changed or ambiguous scaffold declarations fail closed", t => {
  const f = fixture(t);
  f.setHost({ revision: "0".repeat(40) });
  assert.throws(f.check, /cannot read abi.go at Edge SDK revision/);
  f.setHost();
  const source = readFileSync(f.scaffold, "utf8");
  writeFileSync(f.scaffold, source.replace('ScaffoldSDKVersion = "v0.5.0"', "ScaffoldSDKVersion = releaseVersion"));
  assert.throws(f.check, /exactly one literal ScaffoldSDKVersion/);
  writeFileSync(f.scaffold, source + '\nconst ScaffoldSDKVersion = "v0.6.0"\n');
  assert.throws(f.check, /exactly one literal ScaffoldSDKVersion/);
});

test("SDK docs CLI rejects missing inputs and sources and reports real mismatches", t => {
  const f = fixture(t);
  const run = args => spawnSync(process.execPath, [checker, ...args], { cwd: f.root, encoding: "utf8" });
  assert.equal(run([]).status, 2);
  assert.equal(run(["--optional", f.sdk]).status, 2);
  assert.equal(run([path.join(f.root, "missing"), f.sdk]).status, 1);
  assert.equal(run([f.edge, path.join(f.root, "missing")]).status, 1);
  const valid = run([f.edge, f.sdk]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /SDK docs match Edge/);
  f.setHost({ version: "v0.6.0" });
  const stale = run([f.edge, f.sdk]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /version: site publishes/);
  rmSync(f.metadata);
  assert.equal(run([f.edge, f.sdk]).status, 1);
});
