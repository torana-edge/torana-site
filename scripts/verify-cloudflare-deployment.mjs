import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export function deploymentFromOutput(output, expectedCommit) {
  assert.match(expectedCommit || "", /^[a-f0-9]{40}$/, "Expected the full published commit SHA");
  const records = output.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
  const deployments = records.filter(record => record.type === "pages-deploy-detailed");
  assert.equal(deployments.length, 1, "Expected exactly one detailed Pages deployment result");
  const deployment = deployments[0];
  assert.equal(deployment.version, 1, "Unsupported Wrangler output version");
  assert.equal(deployment.pages_project, "torana-site", "Wrong Pages project");
  assert.equal(deployment.environment, "production", "Upload was not a production deployment");
  // Direct-upload responses need not include a top-level production_branch.
  // The workflow enforces main; the response must prove production + exact SHA.
  if (deployment.production_branch !== undefined) {
    assert.equal(deployment.production_branch, "main", "Pages production branch must be main");
  }
  assert.equal(deployment.deployment_trigger?.metadata?.commit_hash, expectedCommit, "Wrong deployed commit");
  const url = new URL(deployment.url);
  assert.equal(url.protocol, "https:");
  assert.match(url.hostname, /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.pages\.dev$/);
  assert.equal(url.username + url.password + url.port + url.search + url.hash, "");
  assert.equal(url.pathname, "/");
  return url.origin;
}

// Compare the actual uploaded artifact, not merely a 200 response from an old site.
export async function verifyFiles(baseURL, files, { fetchImpl = fetch, attempts = 4, wait = delay } = {}) {
  assert.ok(Number.isInteger(attempts) && attempts > 0 && attempts <= 4, "Invalid verification retry count");
  for (const { route, body, headers = {} } of files) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetchImpl(new URL(route, baseURL), {
          redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        assert.equal(response.status, 200, `${route}: expected HTTP 200`);
        for (const [name, value] of Object.entries(headers)) {
          assert.equal(response.headers.get(name), value, `${route}: wrong ${name}`);
        }
        const actual = Buffer.from(await response.arrayBuffer());
        assert.ok(actual.equals(body), `${route}: served bytes differ from the tested build`);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await wait(2_000);
      }
    }
    if (lastError) throw lastError;
  }
}

let phase = "reading Wrangler deployment metadata";
async function main() {
  const output = await readFile(process.env.WRANGLER_OUTPUT_FILE_PATH, "utf8");
  const origin = deploymentFromOutput(output, process.env.GITHUB_SHA);
  phase = "loading the tested build and security headers";
  const headers = Object.fromEntries((await readFile(new URL("../dist/_headers", import.meta.url), "utf8"))
    .split("\n").filter(line => /^\s+[^:]+:/.test(line)).map(line => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    }));
  const routes = [
    ["/", "index.html"], ["/quickstart/", "quickstart/index.html"],
    ["/blog/why-torana/", "blog/why-torana/index.html"],
    ["/blog/context-compaction-negative-result/", "blog/context-compaction-negative-result/index.html"],
    ["/registry/v1/index.json", "registry/v1/index.json"],
    ["/theme.js", "theme.js"], ["/copy.js", "copy.js"],
    ["/social/torana.png", "social/torana.png"],
  ];
  const files = await Promise.all(routes.map(async ([route, file]) => ({
    route, body: await readFile(new URL(`../dist/${file}`, import.meta.url)),
    headers: route === "/" ? headers : {},
  })));
  phase = "checking public routes against the tested build and security headers";
  await verifyFiles(origin, files);
  const message = `Verified production deployment of ${process.env.GITHUB_SHA}: ${origin}\n`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Website published and checked\n\n${message}\nEight public routes match the tested build; homepage security headers match. Custom-domain DNS/TLS is a separate check.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Do not print remote bodies, arbitrary output records, or credentials.
    console.error(`::error::Website verification failed while ${phase}. Check the Wrangler result and Pages deployment status. No automatic rollback was attempted.`);
    process.exitCode = 1;
  });
}
