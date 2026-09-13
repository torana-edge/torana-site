import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
function setup({ saved = null, dark = false, blocked = false } = {}) {
  const events = {};
  const root = { dataset: {} };
  const label = { hidden: true };
  const select = { value: "", closest: () => label, addEventListener: (_, fn) => { events.select = fn; } };
  const media = { matches: dark, addEventListener: (_, fn) => { events.media = fn; } };
  const meta = { content: "" };
  const storage = new Map(saved === null ? [] : [["torana-theme", saved]]);
  const document = {
    documentElement: root,
    querySelector: (selector) => selector === "#theme-choice" ? select : selector.startsWith("meta") ? meta : null,
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  runInNewContext(source, {
    document,
    window: { matchMedia: () => media, addEventListener: (name, fn) => { events[name] = fn; } },
    localStorage: {
      getItem: (key) => { if (blocked) throw Error("blocked"); return storage.get(key); },
      setItem: (key, value) => { if (blocked) throw Error("blocked"); storage.set(key, value); },
    },
    getComputedStyle: () => ({ getPropertyValue: () => root.dataset.theme === "dark" ? "dark-paper" : "light-paper" }),
  });
  return { root, events, media, select, label, meta, storage };
}

test("system choice applies before DOMContentLoaded and follows system changes", () => {
  const app = setup();
  assert.equal(app.root.dataset.theme, "light");
  app.media.matches = true;
  app.events.media();
  assert.equal(app.root.dataset.theme, "dark");
  app.events.DOMContentLoaded();
  assert.equal(app.label.hidden, false);
  assert.equal(app.select.value, "system");
});
test("saved explicit choice wins over the system and updates browser chrome", () => {
  const app = setup({ saved: "light", dark: true });
  app.events.media();
  assert.equal(app.root.dataset.theme, "light");
  assert.equal(app.meta.content, "light-paper");
});
test("selection persists and system can be restored", () => {
  const app = setup({ dark: true });
  app.events.DOMContentLoaded();
  app.select.value = "light";
  app.events.select();
  assert.equal(app.storage.get("torana-theme"), "light");
  assert.equal(app.root.dataset.theme, "light");
  app.select.value = "system";
  app.events.select();
  assert.equal(app.root.dataset.theme, "dark");
});
test("blocked storage and invalid stored values are harmless", () => {
  for (const options of [{ blocked: true }, { saved: "garbage" }]) {
    const app = setup(options);
    assert.equal(app.root.dataset.theme, "light");
    app.events.DOMContentLoaded();
    app.select.value = "dark";
    assert.doesNotThrow(() => app.events.select());
    assert.equal(app.root.dataset.theme, "dark");
  }
});
test("cross-tab changes and cleared storage synchronize the control", () => {
  const app = setup({ saved: "light", dark: true });
  app.events.DOMContentLoaded();
  app.events.storage({ key: "torana-theme", newValue: "dark" });
  assert.equal(app.select.value, "dark");
  app.events.storage({ key: null, newValue: null });
  assert.equal(app.select.value, "system");
  assert.equal(app.root.dataset.theme, "dark");
});
