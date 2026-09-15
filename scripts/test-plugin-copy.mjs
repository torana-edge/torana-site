import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCopy } from "./check-plugin-copy.mjs";
const registry = { plugins: [{ name: "example" }] };
const entry = { title: "A useful plugin", description: "A short explanation.", guide: "https://github.com/torana-edge/torana-plugins/blob/main/plugins/example/README.md" };
test("complete presentation copy passes without changing manifest descriptions", () => {
  assert.doesNotThrow(() => validateCopy(registry, { example: entry }));
});
test("missing, extra, broken and oversized entries fail", () => {
  for (const copy of [{}, {example: entry, extra: entry}, {example: {...entry, guide: "https://example.com"}}, {example: {...entry, description: "x".repeat(321)}}]) {
    assert.throws(() => validateCopy(registry, copy));
  }
});
