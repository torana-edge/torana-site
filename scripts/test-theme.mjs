import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
function setup({ saved = null, dark = false, blocked = false, cssLoaded = true, missingSelect = false, missingLabel = false } = {}) {
  const events = {};
  const root = { dataset: {} };
  const label = { hidden: true };
  const select = { value: "", closest: () => missingLabel ? null : label, addEventListener: (_, fn) => { events.select = fn; } };
  const media = { matches: dark, addEventListener: (_, fn) => { events.media = fn; } };
  const meta = { content: "static-fallback" };
  const css = { loaded: cssLoaded };
  const summary = { focused: false, focus() { this.focused = true; } };
  const inside = {};
  const menu = { open: false, querySelector: () => summary, contains: target => target === summary || target === inside };
  const storage = new Map(saved === null ? [] : [["torana-theme", saved]]);
  const document = {
    documentElement: root,
    querySelector: (selector) => selector === "#theme-choice" ? (missingSelect ? null : select) : selector.startsWith("meta") ? meta : selector === ".mobile-menu" ? menu : null,
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  const localStorage = {
    getItem: key => { if (blocked) throw Error("blocked"); return storage.get(key); },
    setItem: (key, value) => { if (blocked) throw Error("blocked"); storage.set(key, value); },
  };
  runInNewContext(source, {
    document,
    window: { matchMedia: () => media, addEventListener: (name, fn) => { events[name] = fn; } },
    localStorage,
    getComputedStyle: () => ({ getPropertyValue: () => css.loaded ? "light-dark(light-paper, dark-paper)" : "", backgroundColor: root.dataset.theme === "dark" ? "dark-paper" : "light-paper" }),
  });
  return { root, events, media, select, label, meta, storage, localStorage, css, menu, summary, inside };
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

test("initial bootstrap preserves chrome fallback until CSS is loaded", () => {
  const app = setup({ cssLoaded: false });
  assert.equal(app.meta.content, "static-fallback");
  app.css.loaded = true;
  app.events.DOMContentLoaded();
  assert.equal(app.meta.content, "light-paper");
});
test("foreign storage clear does not override local preference", () => {
  const app = setup({ saved: "light", dark: true });
  app.events.DOMContentLoaded();
  app.events.storage({ key: null, newValue: null, storageArea: {} });
  assert.equal(app.select.value, "light");
  app.events.storage({ key: null, newValue: null, storageArea: app.localStorage });
  assert.equal(app.select.value, "system");
});
test("menu handles Escape, inside, summary and outside clicks", () => {
  const app = setup();
  app.events.DOMContentLoaded();
  app.events.click({ target: app.summary });
  // Native details default activation follows the bubbling click.
  app.menu.open = !app.menu.open;
  assert.equal(app.menu.open, true);
  app.events.click({ target: app.inside });
  assert.equal(app.menu.open, true);
  app.events.keydown({ key: "Escape" });
  assert.equal(app.menu.open, false);
  assert.equal(app.summary.focused, true);
  app.menu.open = true;
  app.events.click({ target: {} });
  assert.equal(app.menu.open, false);
});
test("missing theme markup does not prevent menu setup", () => {
  for (const options of [{ missingSelect: true }, { missingLabel: true }]) {
    const app = setup(options);
    assert.doesNotThrow(() => app.events.DOMContentLoaded());
    assert.equal(typeof app.events.keydown, "function");
  }
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
