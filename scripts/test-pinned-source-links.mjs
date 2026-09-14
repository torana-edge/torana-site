import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { checkPinnedLinks, pinnedTarget } from "./check-pinned-source-links.mjs";
import { parse as parseYAML } from "yaml";

const base = "https://github.com/torana-edge";
const checker = fileURLToPath(new URL("./check-pinned-source-links.mjs", import.meta.url));
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "torana-pinned-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, "dist");
  mkdirSync(path.join(dist, "how-it-works"), { recursive: true });
  const checkouts = {};
  const revisions = {};
  for (const repository of ["torana-edge", "torana-plugin-sdk"]) {
    const checkout = path.join(root, repository);
    mkdirSync(path.join(checkout, "docs"), { recursive: true });
    git(checkout, "init", "-b", "main");
    git(checkout, "config", "user.name", "Link test");
    git(checkout, "config", "user.email", "link-test@example.invalid");
    git(checkout, "config", "commit.gpgsign", "false");
    writeFileSync(path.join(checkout, "docs", "Guide.md"), "# Guide\n\n## At the pinned revision\n");
    git(checkout, "add", ".");
    git(checkout, "commit", "-m", "Inspected source");
    checkouts[repository] = checkout;
    revisions[repository] = git(checkout, "rev-parse", "HEAD");
    // Current checkout content intentionally differs from the inspected commit.
    writeFileSync(path.join(checkout, "docs", "Guide.md"), "# Changed on main\n");
    writeFileSync(path.join(checkout, "new-on-main.go"), "package main\n");
    git(checkout, "add", ".");
    git(checkout, "commit", "-m", "Main moved on");
  }
  const link = (repository = "torana-edge", relative = "docs/Guide.md", revision = revisions[repository]) => `${base}/${repository}/blob/${revision}/${relative}`;
  const setLinks = links => writeFileSync(path.join(dist, "how-it-works", "index.html"), links.map(url => `<a href="${url}">Source</a>`).join("\n"));
  const check = () => checkPinnedLinks(checkouts, dist);
  setLinks([link(), link("torana-plugin-sdk")]);
  return { root, dist, checkouts, revisions, link, setLinks, check };
}

test("pinned targets require a full SHA and safe file path in either source repository", () => {
  const sha = "a".repeat(40);
  assert.deepEqual(pinnedTarget(`${base}/torana-plugin-sdk/blob/${sha}/docs/My%20Guide.md#caf%C3%A9`), {
    repository: "torana-plugin-sdk", revision: sha, relative: "docs/My Guide.md", fragment: "café",
  });
  for (const url of [`${base}/torana-edge`, `${base}/torana-edge/issues/1`, `${base}/torana-edge/blob/main/README.md`, `${base}/other/blob/${sha}/README.md`]) assert.equal(pinnedTarget(url), null);
  for (const ref of ["a3f8916", "latest", "a".repeat(39), "g".repeat(40)]) {
    assert.throws(() => pinnedTarget(`${base}/torana-edge/blob/${ref}/README.md`), /full 40-character/);
  }
  for (const relative of ["", "../secret", "%2e%2e%2fsecret", "%2Fsecret", "docs//Guide.md", "docs/%00bad", "docs/%ZZ"]) {
    assert.throws(() => pinnedTarget(`${base}/torana-edge/blob/${sha}/${relative}`));
  }
});

test("built/interpolated links resolve Git objects and fragments at old commits, not HEAD", t => {
  const { check, setLinks, link } = fixture(t);
  setLinks([link() + "#at-the-pinned-revision", link("torana-plugin-sdk") + "#L1-L3"]);
  assert.deepEqual(check(), { checked: 2, failures: [] });
});

test("missing pinned paths fail even when the file exists in the current checkout", t => {
  const { check, setLinks, link } = fixture(t);
  for (const relative of ["missing.go", "new-on-main.go", "docs"]) {
    setLinks([link("torana-edge", relative), link("torana-plugin-sdk")]);
    assert.match(check().failures.join("\n"), /does not exist.*pinned commit|not a file/);
  }
});

test("missing revisions and blob hashes used as commit hashes fail", t => {
  const { check, checkouts, setLinks, link } = fixture(t);
  const blob = git(checkouts["torana-edge"], "rev-parse", "HEAD:docs/Guide.md");
  for (const revision of ["0".repeat(40), blob]) {
    setLinks([link("torana-edge", "docs/Guide.md", revision), link("torana-plugin-sdk")]);
    assert.match(check().failures.join("\n"), /commit .*unavailable|not a commit/);
  }
});

test("shallow checkout missing the pinned history fails with fetch guidance", t => {
  const { root, check, checkouts } = fixture(t);
  const shallow = path.join(root, "shallow-edge");
  git(root, "clone", "--depth=1", pathToFileURL(checkouts["torana-edge"]).href, shallow);
  assert.equal(git(shallow, "rev-parse", "--is-shallow-repository"), "true");
  checkouts["torana-edge"] = shallow;
  assert.match(check().failures.join("\n"), /fetch the required history/);
});

test("bad heading, line range, malformed SHA and fragment all fail", t => {
  const { check, setLinks, link } = fixture(t);
  for (const invalid of [link() + "#changed-on-main", link() + "#L999", link() + "#L3-L1", link() + "#%ZZ", link("torana-edge", "docs/Guide.md", "bad-sha")]) {
    setLinks([invalid, link("torana-plugin-sdk")]);
    assert.ok(check().failures.some(message => message.includes(invalid)), invalid);
  }
});

test("rendered hrefs are checked, not uncompiled constants; each repository is required", t => {
  const { dist, check, setLinks, link } = fixture(t);
  setLinks([link("torana-plugin-sdk")]);
  writeFileSync(path.join(dist, "uncompiled.astro"), `<a href="${link()}">Not built HTML</a>`);
  assert.match(check().failures.join("\n"), /no pinned torana-edge links found/);
  setLinks([link()]);
  assert.match(check().failures.join("\n"), /no pinned torana-plugin-sdk links found/);
  setLinks([]);
  assert.equal(check().failures.length, 2);
  writeFileSync(path.join(dist, "how-it-works", "index.html"), `<a href='${link()}?plain=1&amp;foo=2'>Edge</a><a href=${link("torana-plugin-sdk")}>SDK</a>`);
  assert.deepEqual(check(), { checked: 2, failures: [] });
});

test("CLI requires both real checkouts and built HTML, with no optional skip", t => {
  const { root, dist, checkouts } = fixture(t);
  const edge = checkouts["torana-edge"];
  const sdk = checkouts["torana-plugin-sdk"];
  const run = args => spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: "utf8" });
  for (const args of [[], [edge], ["--optional", edge, sdk]]) assert.equal(run(args).status, 2);
  for (const args of [[edge, path.join(root, "missing")], [dist, sdk], [edge, sdk, path.join(root, "missing-build")]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot verify pinned source links/);
  }
  const valid = run([edge, sdk]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /checked 2 pinned Edge\/SDK/);
});

test("CI requires both repositories' history and validates the rendered build without skips", () => {
  const workflow = parseYAML(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs.build.steps;
  const validation = steps.findIndex(step => step.run === "npm run source-links:check -- _sources/torana-edge _sources/torana-plugin-sdk");
  const build = steps.findIndex(step => step.run === "npm test");
  assert.ok(build >= 0 && validation > build, "Interpolated links must be checked after the real site build");
  for (const repository of ["torana-edge", "torana-plugin-sdk"]) {
    const checkout = steps.findIndex(step => step.with?.repository === `torana-edge/${repository}`);
    assert.ok(checkout >= 0 && checkout < validation, `Missing ${repository} history checkout`);
    assert.equal(steps[checkout].with["fetch-depth"], 0, `${repository} needs historical commits, not only HEAD`);
    assert.equal(steps[checkout].if, undefined);
    assert.equal(steps[checkout]["continue-on-error"], undefined);
  }
  assert.equal(steps[validation].if, undefined);
  assert.equal(steps[validation]["continue-on-error"], undefined);
});
