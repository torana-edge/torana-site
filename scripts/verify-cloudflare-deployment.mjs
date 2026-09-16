import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Only messages constructed here may reach deployment logs. JSON, URL, fetch,
// filesystem and assertion errors can include untrusted input or secret values.
class VerificationError extends Error {}
function check(condition, message) {
  if (!condition) throw new VerificationError(message);
}

export function failureMessage(error, phase) {
  const detail = error instanceof VerificationError ? error.message : "Unexpected error; inspect the local build or deployment status.";
  return `Website verification failed while ${phase}: ${detail} No automatic rollback was attempted.`
    .replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function deploymentFromOutput(output, expectedCommit) {
  check(/^[a-f0-9]{40}$/.test(expectedCommit || ""), "Expected the full published commit SHA");
  let records;
  try {
    records = output.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
  } catch {
    throw new VerificationError("Wrangler output is not valid NDJSON");
  }
  const deployments = records.filter(record => record?.type === "pages-deploy-detailed");
  check(deployments.length === 1, "Expected exactly one detailed Pages deployment result");
  const deployment = deployments[0];
  check(deployment.version === 1, "Unsupported Wrangler output version");
  check(deployment.pages_project === "torana-site", "Wrong Pages project");
  check(deployment.environment === "production", "Upload was not a production deployment");
  // Direct-upload responses need not include a top-level production_branch.
  // The workflow enforces main; the response must prove production + exact SHA.
  if (deployment.production_branch !== undefined) {
    check(deployment.production_branch === "main", "Pages production branch must be main");
  }
  check(deployment.deployment_trigger?.metadata?.commit_hash === expectedCommit, "Wrong deployed commit");
  let url;
  try { url = new URL(deployment.url); } catch {
    throw new VerificationError("Invalid deployment URL");
  }
  check(url.protocol === "https:" && /^[a-z0-9-]+\.torana-site\.pages\.dev$/.test(url.hostname)
    && url.username + url.password + url.port + url.search + url.hash === "" && url.pathname === "/",
  "Expected a credential-free HTTPS URL for a unique torana-site deployment");
  return url.origin;
}

function matchHeaderRule(pattern, url) {
  const absolute = /^https:\/\/([^/]+)(\/.*)?$/.exec(pattern);
  check(absolute || pattern.startsWith("/"), "Invalid URL pattern in _headers");
  const host = absolute ? absolute[1].toLowerCase() : "";
  const source = absolute ? host + (absolute[2] || "/") : pattern;
  check((source.match(/\*/g) || []).length <= 1, "Only one splat is allowed per _headers rule");
  const names = [];
  let expression = "", cursor = 0;
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const token of source.matchAll(/:[A-Za-z]\w*|\*/g)) {
    expression += escape(source.slice(cursor, token.index));
    const name = token[0] === "*" ? "splat" : token[0].slice(1);
    check(!names.includes(name), "Duplicate placeholder in _headers rule");
    names.push(name);
    expression += token[0] === "*" ? "(.*)" : token.index < host.length ? "([^./]+)" : "([^/]+)";
    cursor = token.index + token[0].length;
  }
  expression += escape(source.slice(cursor));
  const matched = new RegExp(`^${expression}$`).exec((absolute ? url.hostname : "") + url.pathname);
  return matched ? Object.fromEntries(names.map((name, index) => [name, matched[index + 1]])) : null;
}

// All matching blocks contribute headers. Duplicate values are comma-joined;
// detach rules remove a header even when it came from a more general block.
export function headersForURL(source, target) {
  const url = new URL(target), headers = new Map(), removed = new Set();
  let variables, hasRule = false;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      variables = matchHeaderRule(text, url);
      hasRule = true;
      continue;
    }
    check(hasRule, `_headers line ${index + 1}: header has no URL rule`);
    const detach = /^!\s+([!#$%&'*+.^_`|~0-9A-Za-z-]+)$/.exec(text);
    const header = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):\s*(.*)$/.exec(text);
    check(detach || header, `_headers line ${index + 1}: invalid header directive`);
    if (!variables) continue;
    const name = (detach || header)[1].toLowerCase();
    if (detach) { removed.add(name); continue; }
    const value = header[2].replace(/:([A-Za-z]\w*)/g, (token, key) => variables[key] ?? token);
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
  }
  for (const name of removed) headers.set(name, null);
  return Object.fromEntries(headers);
}

// Compare the actual uploaded artifact, not merely a 200 response from an old site.
export async function verifyFiles(baseURL, files, { fetchImpl = fetch, attempts = 4, wait = delay } = {}) {
  check(Number.isInteger(attempts) && attempts > 0 && attempts <= 4, "Invalid verification retry count");
  for (const { route, body, headers = {}, requestHeaders } of files) {
    check(/^\/[a-zA-Z0-9/_.-]*$/.test(route), "Invalid verification route");
    check(Object.keys(headers).every(name => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)), `${route}: invalid expected header name`);
    check(requestHeaders === undefined || Object.keys(requestHeaders).every(name => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)), `${route}: invalid request header name`);
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const options = { redirect: "error", signal: AbortSignal.timeout(10_000) };
        if (requestHeaders) options.headers = requestHeaders;
        const response = await fetchImpl(new URL(route, baseURL), options);
        check(response.status === 200, `${route}: expected HTTP 200`);
        for (const [name, value] of Object.entries(headers)) {
          check(response.headers.get(name) === value, `${route}: wrong ${name}`);
        }
        const actual = Buffer.from(await response.arrayBuffer());
        check(actual.equals(body), `${route}: served bytes differ from the tested build`);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error instanceof VerificationError ? error
          : new VerificationError(`${route}: request failed (network, timeout, redirect, or response read)`);
        if (attempt + 1 < attempts) await wait(2_000);
      }
    }
    if (lastError) throw lastError;
  }
}

export function verificationSummary(commit, origin) {
  return `### Uploaded build verified\n\nVerified production deployment of ${commit}: ${origin}\n\n`
    + "- Ten routes at this unique deployment URL match the tested build and their applicable _headers rules, including the technical guide and homepage Markdown variant.\n"
    + "- This does not verify that torana-site.pages.dev or torana.sh serves this revision. Alias freshness and custom-domain DNS/TLS require separate checks.\n";
}

let phase = "reading Wrangler deployment metadata";
async function main() {
  const output = await readFile(process.env.WRANGLER_OUTPUT_FILE_PATH, "utf8");
  const origin = deploymentFromOutput(output, process.env.GITHUB_SHA);
  phase = "loading the tested build and security headers";
  const headers = await readFile(new URL("../dist/_headers", import.meta.url), "utf8");
  const routes = [
    ["/", "index.html"], ["/quickstart/", "quickstart/index.html"],
    ["/how-it-works/", "how-it-works/index.html"],
    ["/blog/why-torana/", "blog/why-torana/index.html"],
    ["/blog/context-compaction-negative-result/", "blog/context-compaction-negative-result/index.html"],
    ["/registry/v1/index.json", "registry/v1/index.json"],
    ["/theme.js", "theme.js"], ["/copy.js", "copy.js"],
    ["/social/torana.png", "social/torana.png"],
  ];
  const files = await Promise.all(routes.map(async ([route, file]) => ({
    route, body: await readFile(new URL(`../dist/${file}`, import.meta.url)),
    headers: headersForURL(headers, new URL(route, origin)),
  })));
  files.push({
    route: "/",
    body: await readFile(new URL("../dist/_markdown/index.md", import.meta.url)),
    requestHeaders: { Accept: "text/markdown" },
    headers: {
      ...headersForURL(headers, new URL("/", origin)),
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept",
    },
  });
  phase = "checking public routes against the tested build and security headers";
  await verifyFiles(origin, files);
  const message = verificationSummary(process.env.GITHUB_SHA, origin);
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`::error::${failureMessage(error, phase)}`);
    process.exitCode = 1;
  });
}
