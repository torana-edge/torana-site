import assert from 'node:assert/strict';
import test from 'node:test';
import {blockedFindings} from './check-dependency-audit.mjs';

const now = Date.parse('2026-10-03T00:00:00Z');
const report = () => ({auditReportVersion: 2, vulnerabilities: {
  'http-cache-semantics': {name: 'http-cache-semantics', severity: 'high', nodes: ['node_modules/http-cache-semantics'], via: [{url: 'https://github.com/advisories/GHSA-ch52-4w7c-c8xp'}]},
  astro: {name: 'astro', severity: 'high', nodes: ['node_modules/astro'], via: ['http-cache-semantics']},
}});
const lock = {packages: {'node_modules/http-cache-semantics': {version: '4.2.0', resolved: 'https://registry.npmjs.org/http-cache-semantics/-/http-cache-semantics-4.2.0.tgz'}}};

test('accepts only the approved advisory and its Astro transitive finding', () => {
  assert.deepEqual(blockedFindings(report(), lock, now), []);
});
test('new findings on either package remain blocking', () => {
  for (const name of ['astro', 'http-cache-semantics']) {
    const changed = report();
    changed.vulnerabilities[name].via.push({url: 'https://github.com/advisories/GHSA-other'});
    assert.ok(blockedFindings(changed, lock, now).some(f => f.name === name));
  }
});
test('unrelated high and critical findings remain blocking', () => {
  for (const severity of ['high', 'critical']) {
    const changed = report();
    changed.vulnerabilities.other = {name: 'other', severity, via: [], nodes: []};
    assert.deepEqual(blockedFindings(changed, lock, now).map(f => f.name), ['other']);
  }
});
test('severity escalation, expiry, another dependency version or source fails closed', () => {
  const critical = report();
  critical.vulnerabilities['http-cache-semantics'].severity = 'critical';
  assert.equal(blockedFindings(critical, lock, now).length, 2);
  assert.equal(blockedFindings(report(), lock, Date.parse('2026-11-02T00:00:00Z')).length, 2);
  for (const change of [{version: '4.2.1'}, {resolved: 'https://example.invalid/other.tgz'}]) {
    const changed = structuredClone(lock);
    Object.assign(changed.packages['node_modules/http-cache-semantics'], change);
    assert.equal(blockedFindings(report(), changed, now).length, 2);
  }
});
test('malformed or failed reports are not accepted', () => {
  for (const changed of [{}, {auditReportVersion: 3, vulnerabilities: {}}, {...report(), error: {message: 'offline'}}]) {
    assert.throws(() => blockedFindings(changed, lock, now));
  }
});
test('clean reports succeed without an exception', () => {
  assert.deepEqual(blockedFindings({auditReportVersion: 2, vulnerabilities: {}}, lock, now), []);
});
