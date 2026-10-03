import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const advisory = 'https://github.com/advisories/GHSA-ch52-4w7c-c8xp';
// Owner-approved temporary risk acceptance, reviewed 2026-10-03. The site is
// static; this dependency handles build-time remote images, not visitor caches.
// Remove on the official patched release. Reassess by 2026-11-02; the exception
// fails closed then, or if SSR/an adapter is enabled or the dependency changes.
const expires = Date.parse('2026-11-02T00:00:00Z');

export function blockedFindings(report, lock, now = Date.now()) {
  assert.ok(!report.error && report.auditReportVersion === 2 && report.vulnerabilities, 'Unsupported or failed npm audit report');
  const cache = report.vulnerabilities['http-cache-semantics'];
  const accepted = now < expires && cache?.severity === 'high'
    && cache.via.length === 1 && cache.via[0].url === advisory
    && cache.nodes.length === 1 && cache.nodes[0] === 'node_modules/http-cache-semantics'
    && lock.packages[cache.nodes[0]]?.version === '4.2.0'
    && lock.packages[cache.nodes[0]]?.resolved === 'https://registry.npmjs.org/http-cache-semantics/-/http-cache-semantics-4.2.0.tgz';
  return Object.values(report.vulnerabilities).filter(finding => {
    if (!['high', 'critical'].includes(finding.severity)) return false;
    if (accepted && finding.name === 'http-cache-semantics') return false;
    if (accepted && finding.name === 'astro' && finding.severity === 'high'
      && finding.nodes.length === 1 && finding.nodes[0] === 'node_modules/astro'
      && finding.via.length === 1 && finding.via[0] === 'http-cache-semantics') return false;
    return true;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {default: config} = await import('../astro.config.mjs');
  assert.ok(config.output === 'static' && !config.adapter, 'Audit exception requires a static site without a server adapter');
  const audit = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], {encoding: 'utf8', timeout: 120000});
  assert.ok(!audit.error && [0, 1].includes(audit.status), 'npm audit did not produce a valid report');
  const report = JSON.parse(audit.stdout);
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const failures = blockedFindings(report, lock);
  if (report.vulnerabilities?.['http-cache-semantics'] && !failures.some(f => f.name === 'http-cache-semantics')) {
    console.warn(`Temporary static-site risk acceptance: ${advisory}; expires 2026-11-02. Dependency is NOT patched.`);
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  } else {
    console.log('No other high/critical findings.');
  }
}
