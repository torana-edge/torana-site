import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deploymentFromOutput, verifyFiles } from "./verify-cloudflare-deployment.mjs";

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
