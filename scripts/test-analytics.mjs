import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { analyticsWebsiteId, analyticsHeaders } from "../src/lib/analytics-config.mjs";

const source = readFileSync(new URL("../public/analytics.js", import.meta.url), "utf8");
const copySource = readFileSync(new URL("../public/copy.js", import.meta.url), "utf8");
const website = "00000000-0000-4000-8000-000000000001";
const baseline = readFileSync(new URL("../src/config/security-headers.txt", import.meta.url), "utf8");

function setup({ url = "https://torana.sh/", page = "/", id = website, privacy = {}, browser = {}, referrer = "" } = {}) {
  const listeners = new Map();
  const scripts = [];
  const payloads = [];
  const calls = [];
  const navigator = { ...privacy };
  const window = { location: new URL(url), ...browser };
  const document = {
    referrer,
    currentScript: { dataset: { websiteId: id, page } },
    head: { append: script => scripts.push(script) },
    createElement: tag => {
      assert.equal(tag, "script");
      return { dataset: {}, listeners: {}, addEventListener(name, fn, options) { this.listeners[name] = { fn, options }; } };
    },
    addEventListener(name, fn) {
      const entries = listeners.get(name) || [];
      entries.push(fn);
      listeners.set(name, entries);
    },
  };
  const context = { document, navigator, window, URL };
  const run = () => runInNewContext(source, context);
  const load = () => {
    window.umami = { track(payload) {
      calls.push(payload);
      const safe = window.toranaAnalyticsBeforeSend("event", payload);
      if (safe) payloads.push(JSON.parse(JSON.stringify(safe)));
      return Promise.resolve();
    } };
    const entry = scripts[0]?.listeners.load;
    if (entry) {
      if (entry.options?.once) delete scripts[0].listeners.load;
      entry.fn();
    }
  };
  const emit = (name, target, extra = {}) => {
    for (const fn of listeners.get(name) || []) fn({ target, button: 0, defaultPrevented: false,
      preventDefault() { throw Error("Analytics must not block navigation"); },
      stopPropagation() { throw Error("Analytics must not interfere with other listeners"); }, ...extra });
  };
  run();
  return { scripts, payloads, calls, window, navigator, listeners, document, run, load, emit };
}

function element({ href = "/quickstart/", placement = "main", copy = false, download = false } = {}) {
  const el = {
    href,
    closest: selector => selector === "a[href]" ? (copy ? null : el) : selector === placement ? {} : null,
    hasAttribute: name => name === "download" && download,
    matches: selector => copy && selector === 'button[data-analytics-copy="plugin-install"]',
  };
  return el;
}

test("build config requires the explicit enable flag, production mode, and a valid public ID", () => {
  for (const flag of [undefined, "", "false", true]) assert.equal(analyticsWebsiteId(true, flag, website), undefined);
  assert.equal(analyticsWebsiteId(false, "true", website), undefined);
  assert.equal(analyticsWebsiteId(true, "true", website), website);
  for (const id of [undefined, "", "placeholder", `${website}\"`, ` ${website}`]) {
    assert.throws(() => analyticsWebsiteId(true, "true", id), /valid public Umami Website ID/);
  }
});

test("CSP preserves the baseline when off and adds only verified Umami origins when on", () => {
  assert.equal(analyticsHeaders(baseline, undefined), baseline);
  const enabled = analyticsHeaders(baseline, website);
  assert.equal(enabled.replace(" https://cloud.umami.is", "").replace(" https://gateway.umami.is", ""), baseline);
  assert.match(enabled, /script-src 'self' https:\/\/cloud\.umami\.is;/);
  assert.match(enabled, /connect-src 'self' https:\/\/gateway\.umami\.is\n/);
  assert.doesNotMatch(enabled, /\*\.umami|script-src[^;]*unsafe-inline/);
});

test("no provider script, listeners, or globals on local, preview, wrong-protocol, or unknown pages", () => {
  for (const options of [
    { id: "" }, { id: "invalid" }, { page: "" }, { page: "/unlisted/", url: "https://torana.sh/unlisted/" },
    { url: "http://torana.sh/" }, { url: "https://torana.sh:444/" }, { url: "http://localhost:4321/" },
    { url: "https://torana-site.pages.dev/" }, { url: "https://abc.torana-site.pages.dev/" },
    { url: "https://preview.torana.sh/" }, { url: "https://www.torana.sh/" },
    { url: "https://torana.sh/private-token/" }, { url: "https://torana.sh/%71uickstart/", page: "/quickstart/" },
  ]) {
    const app = setup(options);
    assert.equal(app.scripts.length, 0, JSON.stringify(options));
    assert.equal(app.listeners.size, 0);
    assert.equal(app.window.toranaAnalyticsBeforeSend, undefined);
  }
});

test("DNT and GPC prevent loading the provider at all", () => {
  for (const options of [
    ...["1", 1, "yes"].map(doNotTrack => ({ privacy: { doNotTrack } })),
    { privacy: { globalPrivacyControl: true } }, { privacy: { msDoNotTrack: "1" } },
    { browser: { doNotTrack: "1" } }, { privacy: { doNotTrack: "0", msDoNotTrack: "1" } },
  ]) assert.equal(setup(options).scripts.length, 0, JSON.stringify(options));
});

test("official tracker is explicitly manual, credential-free, and initialized only once", () => {
  const app = setup({ url: "https://torana.sh/?secret=query#private" });
  app.run();
  assert.equal(app.scripts.length, 1);
  assert.equal(app.listeners.get("click").length, 1);
  const tracker = app.scripts[0];
  assert.equal(tracker.src, "https://cloud.umami.is/script.js");
  assert.equal(tracker.integrity, "sha256-+RgiMywqE/kej+KcCusWlJfLHYcNMaCZxezIvqWOo6w=");
  assert.equal(tracker.crossOrigin, "anonymous");
  assert.equal(tracker.referrerPolicy, "no-referrer");
  assert.equal(tracker.async, true);
  assert.deepEqual({ ...tracker.dataset }, {
    websiteId: website, hostUrl: "https://gateway.umami.is", autoTrack: "false", autoPageview: "false",
    performance: "false", domains: "torana.sh", doNotTrack: "true", excludeSearch: "true", excludeHash: "true",
    fetchCredentials: "omit", beforeSend: "toranaAnalyticsBeforeSend",
  });
  app.emit("click", element());
  assert.equal(app.calls.length, 0);
  app.load();
  app.load();
  assert.deepEqual(app.payloads, [{ website, hostname: "torana.sh", url: "/" }]);
});

test("only known links count, with a static destination and placement and no URL contents", () => {
  const app = setup();
  app.load();
  for (const [href, destination] of [
    ["/quickstart/?secret=hidden#sensitive", "quickstart"], ["/how-it-works/#data-boundary", "how-it-works"],
    ["https://github.com/torana-edge/torana-edge", "github"], ["https://github.com/torana-edge/torana-plugin-sdk", "sdk"],
    ["https://github.com/torana-edge/torana-edge/issues", "feedback"],
    ["https://github.com/torana-edge/torana-plugins/tree/main/plugins/usage_logger?private=value", "plugin-source"],
  ]) {
    app.emit("click", element({ href, placement: "header" }));
    assert.deepEqual(app.payloads.at(-1), { website, hostname: "torana.sh", url: "/", name: "key-link", data: { destination, placement: "header" } });
  }
  const count = app.payloads.length;
  for (const href of ["https://evil.example/", "https://github.com/other/private-repo", "/unexpected-secret/", "mailto:secret@example.com", "javascript:void(0)", "https://user:secret@github.com/torana-edge/torana-edge"]) app.emit("click", element({ href }));
  app.emit("click", element({ placement: "aside" }));
  app.emit("click", element({ download: true }));
  app.emit("click", element(), { button: 2 });
  app.emit("click", element(), { defaultPrevented: true });
  assert.equal(app.payloads.length, count);
});

test("send guard drops unknown types and reconstructs payloads without arbitrary metadata", () => {
  const app = setup();
  const guard = app.window.toranaAnalyticsBeforeSend;
  const incoming = { website, url: "/", title: "secret", referrer: "https://private.example/path", screen: "unique", id: "private-person", extra: "secret" };
  assert.deepEqual(JSON.parse(JSON.stringify(guard("event", incoming))), { website, hostname: "torana.sh", url: "/" });
  const safe = guard("event", { ...incoming, name: "key-link", data: { destination: "quickstart", placement: "body", email: "private@example.com" } });
  assert.deepEqual(JSON.parse(JSON.stringify(safe)), { website, hostname: "torana.sh", url: "/", name: "key-link", data: { destination: "quickstart", placement: "body" } });
  for (const type of ["identify", "performance", "replay", "unknown"]) assert.equal(guard(type, incoming), false);
  for (const payload of [null, {}, { ...incoming, website: "other" }, { ...incoming, url: "/?token=secret" },
    { ...incoming, name: "unlisted" }, { ...incoming, name: "key-link", data: { destination: "private", placement: "body" } },
    { ...incoming, name: "key-link", data: { destination: "quickstart", placement: "private" } }]) assert.equal(guard("event", payload), false);
});

test("referrers are reduced to known fixed origins and never retain private paths or query data", () => {
  for (const [referrer, expected] of [
    ["https://www.linkedin.com/feed/update/private?secret=value#sensitive", "https://www.linkedin.com/"],
    ["https://github.com/private-org/private-repo", "https://github.com/"],
    ["https://www.google.com/search?q=private", "https://www.google.com/"],
    ["https://unknown.example/private", undefined], ["https://www.linkedin.com.evil.example/", undefined],
    ["https://secret@github.com/private", undefined], ["http://github.com/private", undefined], ["", undefined],
  ]) {
    const app = setup({ referrer });
    app.load();
    assert.equal(app.payloads[0].referrer, expected);
    app.emit("click", element());
    assert.equal(app.payloads[1].referrer, expected);
  }
});

test("same-page anchors do not inflate onward navigation and nested article headers count as body", () => {
  const app = setup({ url: "https://torana.sh/how-it-works/", page: "/how-it-works/" });
  app.load();
  app.emit("click", element({ href: "/how-it-works/#routing" }));
  app.emit("click", element({ href: "/how-it-works/?secret=private#arbitrary" }));
  assert.equal(app.payloads.length, 1);
  const link = element();
  link.closest = selector => selector === "a[href]" ? link : ["main", "header"].includes(selector) ? {} : null;
  app.emit("click", link);
  assert.equal(app.payloads[1].data.placement, "body");
  app.emit("click", element({ href: "/docs/plugin-authoring/" }));
  assert.equal(app.payloads[2].data.destination, "plugin-authoring");
});

test("privacy and host checks are repeated on load, each action, and immediately before send", () => {
  const app = setup();
  app.navigator.globalPrivacyControl = true;
  app.load();
  assert.equal(app.calls.length, 0);
  app.navigator.globalPrivacyControl = false;
  app.emit("click", element());
  assert.equal(app.calls.length, 1);
  app.navigator.doNotTrack = "1";
  app.emit("click", element());
  assert.equal(app.calls.length, 1);
  assert.equal(app.window.toranaAnalyticsBeforeSend("event", { website, url: "/" }), false);
  app.navigator.doNotTrack = "0";
  app.window.location = new URL("https://preview.torana.sh/");
  app.emit("click", element());
  assert.equal(app.calls.length, 1);
});

test("provider load failure, synchronous failure and rejected requests never block navigation", async () => {
  const app = setup();
  assert.doesNotThrow(() => app.emit("click", element()));
  app.window.umami = { track() { throw Error("provider unavailable"); } };
  assert.doesNotThrow(() => app.emit("click", element()));
  app.window.umami.track = () => Promise.reject(Error("network blocked"));
  assert.doesNotThrow(() => app.emit("click", element()));
  await new Promise(resolve => setImmediate(resolve));
});

test("copy signals contain no content and count only marked registry success", () => {
  const app = setup({ url: "https://torana.sh/plugins/", page: "/plugins/" });
  app.load();
  app.emit("click", element({ copy: true }));
  assert.equal(app.payloads.length, 1);
  app.emit("torana:copy-success", element({ copy: true }));
  assert.deepEqual(app.payloads[1], { website, hostname: "torana.sh", url: "/plugins/", name: "command-copy", data: { action: "plugin-install", placement: "body" } });
  app.emit("torana:copy-success", element());
  assert.equal(app.payloads.length, 2);
  const other = setup();
  other.load();
  other.emit("torana:copy-success", element({ copy: true }));
  assert.equal(other.payloads.length, 1);
});

test("copy helper emits once only after clipboard success, preserving feedback on tracker failure", async () => {
  for (const failure of ["none", "clipboard", "analytics"]) {
    const signals = [];
    let click;
    let resolveClipboard;
    let rejectClipboard;
    const button = { dataset: { copy: "private clipboard text", copyLabel: "Success" }, textContent: "Copy",
      addEventListener: (_, fn) => { click = fn; }, setAttribute() {}, removeAttribute() {},
      dispatchEvent(event) { if (failure === "analytics") throw Error("listener failure"); signals.push(event); } };
    const status = { textContent: "" };
    runInNewContext(copySource, {
      document: { querySelector: () => status, querySelectorAll: () => [button] },
      navigator: { clipboard: { writeText(value) { assert.equal(value, "private clipboard text"); return new Promise((resolve, reject) => { resolveClipboard = resolve; rejectClipboard = reject; }); } } },
      window: { setTimeout() {} }, Event,
    });
    const pending = click();
    assert.equal(signals.length, 0);
    if (failure === "clipboard") rejectClipboard(Error("denied")); else resolveClipboard();
    await pending;
    if (failure === "none") {
      assert.equal(signals.length, 1);
      assert.equal(signals[0].type, "torana:copy-success");
      assert.equal(signals[0].bubbles, true);
      assert.equal(signals[0].detail, undefined);
    } else assert.equal(signals.length, 0);
    assert.equal(status.textContent, failure === "clipboard" ? "Clipboard access failed. Select and copy the command manually." : "Success");
  }
});
