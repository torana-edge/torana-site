import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentFromOutput, failureMessage, headersForURL, verificationSummary, verifyFiles } from "./verify-cloudflare-deployment.mjs";

const commit = "a".repeat(40);
const deployment = {
  type: "pages-deploy-detailed", version: 1, pages_project: "torana-site",
  environment: "production", production_branch: "main",
  deployment_trigger: { metadata: { commit_hash: commit } },
  url: "https://abc123.torana-site.pages.dev",
};
const output = record => JSON.stringify(record) + "\n";

test("Wrangler configuration targets Pages output, not Worker assets", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.name, "torana-site");
  assert.equal(config.pages_build_output_dir, "./dist");
  assert.equal(config.assets, undefined);
});

test("accept the exact production deployment and its unique HTTPS URL", () => {
  assert.equal(deploymentFromOutput(output({ type: "pages-deploy", version: 1 }) + output(deployment), commit), deployment.url);
  const { production_branch, ...directUpload } = deployment;
  assert.equal(deploymentFromOutput(output(directUpload), commit), deployment.url);
});

test("reject missing, ambiguous, preview, stale and untrusted deployment output", () => {
  for (const text of ["", "not json", output(deployment) + output(deployment),
    ...[
      { version: 2 }, { pages_project: "other" }, { environment: "preview" },
      { production_branch: "feature" }, { deployment_trigger: {} },
      { url: "http://abc123.torana-site.pages.dev" },
      { url: "https://attacker.example" }, { url: "https://user:pass@abc123.torana-site.pages.dev" },
    ].map(patch => output({ ...deployment, ...patch }))]) {
    assert.throws(() => deploymentFromOutput(text, commit));
  }
  assert.throws(() => deploymentFromOutput(output(deployment), "b".repeat(40)));
  assert.throws(() => deploymentFromOutput(output(deployment), undefined));
});

const file = { route: "/", body: Buffer.from("tested site"), headers: { "x-content-type-options": "nosniff" } };
const response = () => new Response(file.body, { headers: file.headers });

test("check deployed bytes and headers without sending credentials or following redirects", async () => {
  await verifyFiles(deployment.url, [file], { fetchImpl: async (url, options) => {
    assert.equal(url.href, deployment.url + "/");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    return response();
  } });
});

test("reject old content, missing headers and HTTP failures with bounded retries", async () => {
  for (const makeResponse of [
    () => new Response("old site", { headers: file.headers }),
    () => new Response(file.body),
    () => new Response("unavailable", { status: 503 }),
  ]) {
    let calls = 0;
    await assert.rejects(verifyFiles(deployment.url, [file], {
      fetchImpl: async () => { calls++; return makeResponse(); }, attempts: 2, wait: async () => {},
    }));
    assert.equal(calls, 2);
  }
});

test("retry a transient network failure and then verify the artifact", async () => {
  let calls = 0;
  await verifyFiles(deployment.url, [file], {
    fetchImpl: async () => { if (++calls === 1) throw new Error("network unavailable"); return response(); },
    wait: async () => {},
  });
  assert.equal(calls, 2);
});

test("verification cannot succeed by requesting zero attempts", async () => {
  await assert.rejects(verifyFiles(deployment.url, [file], { attempts: 0 }));
});

test("diagnostics identify route and failure class without leaking remote content", async () => {
  const secret = "secret-from-remote-data";
  for (const [fetchImpl, expected] of [
    [async () => new Response(secret, { status: 503 }), "/quickstart/: expected HTTP 200"],
    [async () => new Response(secret, { headers: file.headers }), "/quickstart/: served bytes differ"],
    [async () => new Response(file.body, { headers: { "x-content-type-options": secret } }), "/quickstart/: wrong x-content-type-options"],
    [async () => { throw new Error(secret); }, "/quickstart/: request failed"],
  ]) {
    await assert.rejects(verifyFiles(deployment.url, [{ ...file, route: "/quickstart/" }], { fetchImpl, attempts: 1 }), error => {
      const message = failureMessage(error, "checking routes");
      assert.ok(message.includes(expected), message);
      assert.ok(!message.includes(secret), message);
      return true;
    });
  }
  for (const [input, sha, expected] of [
    [output(deployment), "b".repeat(40), "Wrong deployed commit"],
    [secret, commit, "not valid NDJSON"],
    [output({ ...deployment, url: secret }), commit, "Invalid deployment URL"],
    [output({ ...deployment, url: `https://user:${secret}@abc123.torana-site.pages.dev` }), commit, "credential-free HTTPS"],
  ]) {
    assert.throws(() => deploymentFromOutput(input, sha), error => {
      const message = failureMessage(error, "reading metadata");
      assert.ok(message.includes(expected), message);
      assert.ok(!message.includes(secret), message);
      return true;
    });
  }
  assert.doesNotMatch(failureMessage(new Error(secret), "reading files"), /secret-from-remote-data/);
});

test("headers follow path blocks instead of flattening asset headers onto the homepage", () => {
  const source = "# Global security\n/*\n  X-Frame-Options: DENY\n\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  X-Page: home\n/blog/:slug/\n  X-Article: :slug\n";
  assert.deepEqual(headersForURL(source, deployment.url), { "x-frame-options": "DENY", "x-page": "home" });
  assert.deepEqual(headersForURL(source, deployment.url + "/_astro/site.css"), {
    "x-frame-options": "DENY", "cache-control": "public, max-age=31536000, immutable",
  });
  assert.deepEqual(headersForURL(source, deployment.url + "/blog/why-torana/"), {
    "x-frame-options": "DENY", "x-article": "why-torana",
  });
});

test("combine matching blocks, remove headers, and scope absolute rules to the host", () => {
  const source = "/*\n  X-Robots-Tag: noindex\n  X-Remove: value\nhttps://torana.sh/*\n  X-Domain: public\nhttps://:version.torana-site.pages.dev/*\n  x-robots-tag: nofollow\n  X-Version: :version\n  X-Path: :splat\n  ! X-Remove\n";
  assert.deepEqual(headersForURL(source, deployment.url + "/blog/"), {
    "x-robots-tag": "noindex, nofollow", "x-remove": null, "x-version": "abc123", "x-path": "blog/",
  });
  assert.deepEqual(headersForURL(source, "https://torana.sh/"), {
    "x-robots-tag": "noindex", "x-remove": "value", "x-domain": "public",
  });
  assert.deepEqual(headersForURL("/asset.+/*\n  X-Literal: yes\n", "https://torana.sh/assetZZ/file"), {});
  assert.deepEqual(headersForURL("/\r\n  X-Test: yes\r\n", "https://torana.sh/"), { "x-test": "yes" });
  for (const invalid of ["  X-Orphan: value", "/**\n  X-Test: value", "/:same/:same\n  X-Test: value", "/*\n  invalid"]) {
    assert.throws(() => headersForURL(invalid, deployment.url));
  }
});

test("a matching detach rule verifies absence, not just absence of an expectation", async () => {
  const headers = headersForURL("/*\n  X-Remove: secret\n/\n  ! X-Remove\n", deployment.url);
  await verifyFiles(deployment.url, [{ ...file, headers }], { fetchImpl: async () => new Response(file.body) });
  await assert.rejects(verifyFiles(deployment.url, [{ ...file, headers }], {
    fetchImpl: async () => new Response(file.body, { headers: { "x-remove": "secret" } }), attempts: 1,
  }), /wrong x-remove/);
});

test("summary states the deployment-only boundary for both public aliases", () => {
  const summary = verificationSummary(commit, deployment.url);
  assert.match(summary, /unique deployment URL/);
  assert.match(summary, /does not verify that torana-site.pages.dev or torana.sh serves this revision/);
});

test("CLI failure preserves a controlled reason and exits nonzero without echoing metadata", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "torana-deploy-error-"));
  const filename = path.join(directory, "deployment.ndjson");
  writeFileSync(filename, output({ ...deployment, deployment_trigger: { metadata: { commit_hash: "secret-commit-value" } } }));
  t.after(() => { unlinkSync(filename); rmdirSync(directory); });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./verify-cloudflare-deployment.mjs", import.meta.url))], {
    env: { ...process.env, GITHUB_SHA: commit, WRANGLER_OUTPUT_FILE_PATH: filename }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /::error::.*Wrong deployed commit/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-commit-value/);
});
