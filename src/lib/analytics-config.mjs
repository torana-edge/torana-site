/**
 * Both the rendered script and generated CSP use this build-time gate.
 * Preview builds must leave the enable flag unset, even though Astro builds
 * them in production mode. The browser also checks the exact production host.
 * @param {boolean} production
 * @param {unknown} enabled
 * @param {unknown} websiteId
 */
export function analyticsWebsiteId(production, enabled, websiteId) {
  if (!production || enabled !== "true") return undefined;
  if (typeof websiteId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId)) {
    throw new Error("Enabled website analytics requires a valid public Umami Website ID");
  }
  return websiteId;
}

/** @param {string} baseline @param {string | undefined} websiteId */
export function analyticsHeaders(baseline, websiteId) {
  if (!websiteId) return baseline;
  return baseline
    .replace("script-src 'self';", "script-src 'self' https://cloud.umami.is;")
    .replace("connect-src 'self'", "connect-src 'self' https://gateway.umami.is");
}
