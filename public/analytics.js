(() => {
  const script = document.currentScript;
  const website = script?.dataset.websiteId;
  const page = script?.dataset.page;
  const pages = new Map([
    ["/", "home"], ["/quickstart/", "quickstart"], ["/how-it-works/", "how-it-works"],
    ["/docs/", "docs"], ["/docs/support/", "support"],
    ["/docs/plugin-installation/", "plugin-installation"],
    ["/docs/plugin-authoring/", "plugin-authoring"],
    ["/plugins/", "plugins"], ["/plugins/submit/", "share-plugin"],
    ["/blog/", "blog"], ["/blog/why-torana/", "origin-article"],
    ["/blog/context-compaction-negative-result/", "compaction-article"],
    ["/privacy/", "privacy"],
  ]);
  const destinations = new Set([...pages.values(), "github", "sdk", "plugin-source", "feedback", "contribute"]);
  const placements = new Set(["header", "body", "footer"]);
  const path = value => value === "/" ? "/" : `${value.replace(/\/$/, "")}/`;
  const allowed = () => window.location.protocol === "https:"
    && window.location.hostname === "torana.sh" && window.location.port === ""
    && pages.has(page) && path(window.location.pathname) === page
    && navigator.globalPrivacyControl !== true
    && ![navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack]
      .some(value => value === "1" || value === 1 || value === "yes");

  if (!website || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(website)
    || !allowed() || window.toranaAnalyticsInitialized) return;
  window.toranaAnalyticsInitialized = true;

  // Referral reports use only these fixed origins. Unknown/missing referrers
  // remain unattributed; no input URL, path, search, or hash is forwarded.
  const referrers = new Map([
    ["github.com", "https://github.com/"],
    ["linkedin.com", "https://www.linkedin.com/"], ["www.linkedin.com", "https://www.linkedin.com/"], ["lnkd.in", "https://www.linkedin.com/"],
    ["reddit.com", "https://www.reddit.com/"], ["www.reddit.com", "https://www.reddit.com/"], ["old.reddit.com", "https://www.reddit.com/"],
    ["news.ycombinator.com", "https://news.ycombinator.com/"],
    ["x.com", "https://x.com/"], ["t.co", "https://x.com/"], ["twitter.com", "https://x.com/"],
    ["google.com", "https://www.google.com/"], ["www.google.com", "https://www.google.com/"],
    ["www.bing.com", "https://www.bing.com/"], ["bing.com", "https://www.bing.com/"],
    ["duckduckgo.com", "https://duckduckgo.com/"],
  ]);
  let referrer;
  try {
    const url = new URL(document.referrer);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port) referrer = referrers.get(url.hostname);
  } catch { /* Missing or unrecognized sources stay unattributed. */ }

  // Reconstruct every payload from the fixed vocabulary; never forward the
  // provider's default URL, title, referrer, screen, identity, or arbitrary data.
  window.toranaAnalyticsBeforeSend = (type, payload) => {
    if (!allowed() || type !== "event" || !payload || payload.website !== website || payload.url !== page) return false;
    const safe = { website, hostname: "torana.sh", url: page, ...(referrer && { referrer }) };
    if (payload.name === undefined) return safe;
    const { destination, placement, action } = payload.data || {};
    if (!placements.has(placement)) return false;
    if (payload.name === "key-link" && destinations.has(destination)) {
      return { ...safe, name: "key-link", data: { destination, placement } };
    }
    if (payload.name === "command-copy" && action === "plugin-install" && page === "/plugins/") {
      return { ...safe, name: "command-copy", data: { action, placement } };
    }
    return false;
  };

  const send = (name, data) => {
    if (!allowed() || typeof window.umami?.track !== "function") return;
    try {
      // Passing an object excludes Umami's default properties. Never await a
      // tracker from a user action; rejected requests must not affect the site.
      Promise.resolve(window.umami.track({ website, url: page, hostname: "torana.sh", ...(name && { name, data }) })).catch(() => {});
    } catch { /* Analytics is optional, including when storage is blocked. */ }
  };
  const placement = element => element.closest("main") ? "body"
    : element.closest("header") ? "header" : element.closest("footer") ? "footer" : undefined;
  const destination = link => {
    let url;
    try { url = new URL(link.href, "https://torana.sh"); } catch { return undefined; }
    if (url.username || url.password || url.protocol !== "https:" || url.port) return undefined;
    // In-page contents links are not onward navigation, regardless of fragment.
    if (url.hostname === "torana.sh") return path(url.pathname) === page ? undefined : pages.get(path(url.pathname));
    if (url.hostname !== "github.com") return undefined;
    // Only known project destinations count. No repository names, arbitrary
    // paths, query parameters, or fragments are ever sent to the provider.
    if (["/torana-edge", "/torana-edge/torana-edge"].includes(url.pathname.replace(/\/$/, ""))) return "github";
    if (url.pathname === "/torana-edge/torana-edge/issues") return "feedback";
    if (url.pathname === "/torana-edge/torana-edge/blob/main/CONTRIBUTING.md") return "contribute";
    if (url.pathname === "/torana-edge/torana-plugin-sdk") return "sdk";
    if (url.pathname === "/torana-edge/torana-plugins"
      || /^\/torana-edge\/torana-plugins\/tree\/main\/plugins\/[a-z][a-z0-9_]*\/?$/.test(url.pathname)) return "plugin-source";
    return undefined;
  };

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download")) return;
    const target = destination(link);
    const where = placement(link);
    if (target && where) send("key-link", { destination: target, placement: where });
  });
  document.addEventListener("torana:copy-success", event => {
    const button = event.target;
    if (button.matches?.('button[data-analytics-copy="plugin-install"]') && page === "/plugins/") {
      const where = placement(button);
      if (where) send("command-copy", { action: "plugin-install", placement: where });
    }
  });

  const tracker = document.createElement("script");
  tracker.src = "https://cloud.umami.is/script.js";
  tracker.async = true;
  tracker.referrerPolicy = "no-referrer";
  tracker.dataset.websiteId = website;
  tracker.dataset.hostUrl = "https://gateway.umami.is";
  tracker.dataset.autoTrack = "false";
  tracker.dataset.autoPageview = "false";
  tracker.dataset.performance = "false";
  tracker.dataset.domains = "torana.sh";
  tracker.dataset.doNotTrack = "true";
  tracker.dataset.excludeSearch = "true";
  tracker.dataset.excludeHash = "true";
  tracker.dataset.fetchCredentials = "omit";
  tracker.dataset.beforeSend = "toranaAnalyticsBeforeSend";
  tracker.addEventListener("load", () => send(), { once: true });
  // No queue, retries, proxy fallback, or preconnect: blockers stay effective.
  document.head.append(tracker);
})();
