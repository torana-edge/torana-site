# Aggregate website analytics

Website analytics uses two deliberately separate sources. Cloudflare Web
Analytics measures aggregate browser traffic and page-load performance. The
official Umami Cloud script records manual, allowlisted page views and key
events, including successful command copies that Cloudflare does not observe.
The local Torana proxy is not instrumented by either integration. `/privacy/`
describes the active build's configuration.

Cloudflare injects its Web Analytics beacon at the production edge. The source
build does not contain the beacon tag, but its baseline Content Security Policy
permits `https://static.cloudflareinsights.com`. The automatically injected
beacon reports to the same-origin `/cdn-cgi/rum` endpoint, already covered by
`connect-src 'self'`. Local builds and unique Pages preview responses do not
gain a beacon merely because the CSP permits its source. Cloudflare dashboard
configuration remains the authority for whether edge injection is enabled.

Collection is off by default. For the production **Deploy website** workflow,
set these repository **Actions variables** (not dashboard API credentials):

| Variable | Production value |
| --- | --- |
| `PUBLIC_ANALYTICS_ENABLED` | `true` to enable, unset or `false` to disable |
| `PUBLIC_UMAMI_WEBSITE_ID` | The public UUID from the Umami website's tracking code |

The production workflow passes these variables only to its tested build. Pull
request CI does not receive production values: it tests the default-disabled
build first, then builds and checks a fixed dummy enabled fixture without
publishing either artifact. Keep them unset in any future preview build
pipeline. An enabled build with a missing or malformed ID fails. Development
mode stays off; the browser additionally requires exactly `https://torana.sh`
with no nonstandard port and a known canonical page path. Localhost, `pages.dev`,
preview subdomains, and unknown paths never load the provider, even if someone
opens an enabled build there. Do Not Track and Global Privacy Control are checked
before loading the script and before sending each event.

The source security-header baseline is `src/config/security-headers.txt`.
Astro explicitly injects a static `/_headers` endpoint (underscore-prefixed files
are otherwise ignored as routes) to generate `dist/_headers` with the same config
as the page layout. Disabled Umami builds retain the exact baseline bytes,
including the Cloudflare Web Analytics source. Enabled Umami builds additionally
add only `https://cloud.umami.is` to `script-src` and
`https://gateway.umami.is` to `connect-src`. The official Cloud tracker and its
collector were verified on 2026-09-14; changes to these hosts need deliberate
source review and matching tests. There is no inline script exception, wildcard,
proxy fallback, or automatic provider initialization.

The Cloud script is pinned with browser-enforced Subresource Integrity and
`crossOrigin="anonymous"`. The reviewed SHA-256 is
`f91822332c2a13f91e8fe29c0aeb169497cb1d870d31a099c5ecc8bea58ea3ac`;
`public/analytics.js` contains its equivalent `sha256-…` Base64 integrity value.
The provider currently permits the required anonymous CORS request. A changed
script or missing CORS permission stops analytics before any provider code runs;
the site continues to work, with no unpinned retry or fallback. Because the
provider URL is unversioned, a routine Umami update can pause collection until
we review and update this pin.

Check the public script for changes before a release and when collection
unexpectedly stops. To update it, review the new tracker source and its behavior
(especially manual initialization, payloads, storage, and collector hosts), then
compute its SHA-256 from the exact served bytes. Update the integrity value,
matching unit assertion, and review date/hash here in one PR. Verify in a browser
that the matching script sends only the approved payloads, and that a deliberately
modified response is rejected before execution with no collector requests.
Intercept all collector requests during these checks; do not send test events to
the production dashboard. Confirm copying and navigation still work on an
integrity failure, and rerun both build configurations before publishing the pin.

The event vocabulary is deliberately small:

| Signal | Meaning and properties |
| --- | --- |
| Page view | Known canonical `url`; query strings and fragments are omitted |
| `key-link` | Fixed `destination` and `placement` (`header`, `body`, `footer`) for known site/project links; same-page contents links are excluded |
| `command-copy` | `action=plugin-install` and placement, only after a marked registry command is successfully copied |

Each payload uses a fixed website hostname. Recognized referral hosts map to
fixed origins for GitHub, LinkedIn, Reddit, Hacker News, X, Google, Bing, and
DuckDuckGo. Referrer paths, search parameters, and fragments are never sent;
unrecognized, same-site, or absent referrers remain unattributed. This is partial
source attribution, not campaign/UTM tracking. No text, form values, clipboard
contents, custom identities, screen dimensions, or arbitrary metadata enter the
payload. Umami's `identify`, recording, heatmap, and performance features are not
enabled. Its ordinary request metadata can still produce pseudonymous session,
visit, browser, and location statistics. The site adds no analytics cookies or
persistent visitor ID; the tracker can read `umami.disabled` and keeps its response
cache only in memory.

When adding a public route or key destination, update the explicit vocabulary in
`public/analytics.js`. A visitor who blocks the script or navigates before it loads
is not counted. There is no event queue, retry, or navigation delay. Counts do not
prove installs, successful proxy runs, or completed reading.

Verify both configurations before changing this integration:

```sh
npm test
PUBLIC_ANALYTICS_ENABLED=true PUBLIC_UMAMI_WEBSITE_ID=00000000-0000-4000-8000-000000000001 npm test
```

The fixture ID is only for local verification; do not deploy it. Serve the enabled
build locally to inspect the disclosure and prove that no Umami request occurs.
The unit checks cover missing config, preview hosts, DNT/GPC, unknown paths,
sanitized payloads, duplicate initialization, copy success/failure, and provider
failures. Built checks require a file at `dist/_headers`, exact CSP agreement,
matching script/disclosure state on every page, and production-only workflow vars.

After the reviewed production deployment, verify a page view in Cloudflare Web
Analytics plus one page view and key event in the real Umami dashboard. Check
that Cloudflare's injected script and same-origin `/cdn-cgi/rum` request are not
blocked by CSP. Then check that a DNT/GPC browser and the unique Pages preview URL
make no Umami requests. A passing build does not prove live ingestion.
To stop collection, unset `PUBLIC_ANALYTICS_ENABLED` and rebuild/deploy; changing a
build variable alone cannot alter files already served. This stops Umami only;
Cloudflare Web Analytics is controlled separately in the Cloudflare dashboard.

References: [manual payloads](https://docs.umami.is/docs/tracker-functions),
[tracker configuration](https://docs.umami.is/docs/tracker-configuration),
[metric definitions](https://docs.umami.is/docs/metric-definitions), and the
[official tracker source](https://github.com/umami-software/umami/blob/master/src/tracker/index.ts).
