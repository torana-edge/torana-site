# torana.sh

The public product, documentation, blog, and curated plugin-registry site for Torana.

## Local development

```sh
npm ci
npm run dev
```

## Verify changes

```sh
npm test
npm run registry:check -- ../torana-plugins
npm run owned-content:check -- ../torana-edge
npm run edge-links:check -- ../torana-edge
```

`npm test` runs the unit tests, builds the site, then checks built pages. For a
quick theme/menu check use `npm run test:unit`; `npm run test:built` checks an
existing build. Each palette token uses one `light-dark()` pair, selected by
the system preference or the header control.

The theme helper runs as a same-origin external script before body paint, retaining
the CSP restriction against inline scripts. System / Light / Dark is available in
the header. Without JavaScript, CSS follows the system theme and the native mobile
navigation still works. Browser storage is optional.

Plugin capability lists, source links, and install commands use the generated
registry JSON. Do not maintain a second hand-written permissions list.

The homepage features three examples and derives the full plugin count from that
same catalogue. Community authors can use `/plugins/submit/` and the
`plugin-listing.yml` issue form to request a listing while keeping their own repo.
Requests require maintainer review; they do not automatically update the generated
official registry or Edge's `--official` install set. When adding community entries,
keep their ownership explicit and separate from that generated official catalogue.
Record the reviewed commit (resolving a submitted tag to its commit), not a moving
branch, when adding or updating a community listing. Review does not cover later
revisions automatically. Maintainers may remove listings for unavailable source,
lapsed maintenance or compatibility, changed licensing, or security concerns.
The issue form uses the repository's `plugin-listing` label for triage; preserve
that label when maintaining the form, rather than relying on its editable title.

The Edge link check resolves repository-root links to `README.md`, checks linked
files on `main`, and verifies Markdown heading or source-line fragments. It parses
Markdown and uses GitHub heading slugs, including duplicate headings; headings
inside code blocks do not count. Custom raw-HTML anchors are not supported by this
check. Prefer generated heading anchors in site links. A missing checkout fails;
only an explicit local `--optional` may skip an absent checkout. The regression
tests run in `npm test` as well as `npm run edge-links:test`.

Social cards live in `public/social/`: editable SVG sources and matching 1200×630
PNG exports. Keep each pair in sync; pages link to the PNG for social previews.
The origin and compaction articles have their own cards.

After editing a card, run `npm run social:build` and commit both the SVG and PNG.
`npm run social:check` freshly renders every SVG and byte-compares the committed
PNG. It fails for stale, missing, corrupted or orphaned exports without repairing
them. It runs inside `npm run build`, so ordinary CI cannot ship a stale preview.

Rendering uses the pinned development-only `@resvg/resvg-wasm` dependency and
publicly hosted Geist Regular/Bold files at an immutable upstream revision, with
SHA-256 checks. This avoids platform-specific Arial fallbacks and native renderer
differences. The first run needs HTTPS access to raw.githubusercontent.com; fonts
are cached by digest in the system temporary directory at
`torana-site-social-fonts/`, outside the repository and build output. Cache hits
are verified too. A missing network/font or integrity failure is an error, not a
reason to skip the check or substitute another font. The fonts are licensed under
the [SIL Open Font License](https://github.com/vercel/geist-font/blob/a6d260e6cbc07eafdfad438f33601fe3c38b1e6f/OFL.txt).
No font files or renderer code are shipped to the website; its existing hosted
fonts and browser fallbacks are unchanged. Still visually review card layout
when changing copy: matching bytes prove freshness, not good typography.

Before announcing the release, replace development-source installation with the
verified tag instructions in Edge and `src/data/install.ts` together, then update
the support matrix with the actual manual-test results. The owned-content check
currently enforces pre-release language and will need to evolve with that change.
Keep the site and launch articles focused on the project: no personal biography,
named-author promotion, or personal-profile footer. The side-project journey,
architectural scope creep, and technical lessons can keep their informal voice.
First person is welcome when owning an experiment, measurement, or engineering
decision; it does not need a biography or promotional byline.
Review the origin article and add the real release demo;
no recording or unverified release number is substituted here.

## Publish the website now; announce the product later

Website hosting is independent of the Torana binary release. Publish the current
content and refine it on subsequent main updates. Keep the existing accurate
source-install instructions until a tagged binary has actually been verified;
hosting the site does not imply that the product release or social announcement
has happened.

## Cloudflare Pages setup — once per account

This repository deploys a static Astro build to **Cloudflare Pages**, not Workers.
`wrangler.jsonc` names `torana-site` and sets `pages_build_output_dir` to `./dist`.
Do not use `wrangler deploy` or add a Worker entry point for this site.

1. From this directory, run `npx --no-install wrangler login` and approve the
   browser prompt. `npx --no-install wrangler whoami` confirms the account.
2. Check `npx --no-install wrangler pages project list`. If the project does not
   exist, create it with
   `npx --no-install wrangler pages project create torana-site --production-branch main`.
   Use the intended Cloudflare account; do not replace an existing project.
   Wrangler 4.131 can redirect a new project to Workers when run by an agent.
   If that happens, `--force` on this one-time **project create** command selects
   the Pages API; it does not overwrite a project. Existing Pages projects do
   not need that flag for subsequent deployments.
3. For GitHub deployment, create an API token with **Account → Cloudflare Pages →
   Edit**, restricted to that account. Add `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` in the repository's **Settings → Secrets and variables →
   Actions**. Local OAuth login does not supply credentials to GitHub Actions.
   Enter values directly into secret storage, never a commit, issue, or chat.

Configure and validate both deployment credentials **before merging the publishing
workflow**. Missing credentials intentionally fail main's deployment; do not
normalize an expected red workflow or restore the old successful-skip behaviour.

See Cloudflare's [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
and [CI credentials guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
Do not enable a second Git-integrated deployment pipeline for the same project;
GitHub Actions owns deployment here.

## Publish and verify

The **Deploy website** workflow runs on main pushes, or can be dispatched manually
on main from Actions. It rejects other refs and missing credentials, installs the
lockfile dependencies, runs `npm test`, and uploads the tested `dist` to the Pages
production branch with the exact Git commit recorded.

The final step consumes Wrangler's structured deployment output and verifies:

- the project, production environment, and commit match;
- eight routes at the unique deployment URL serve bytes identical to the build, including the homepage,
  quickstart, both articles, registry, scripts, and social image;
- each checked route serves its applicable generated `dist/_headers` rules, respecting
  path/host patterns, combined headers and detach rules;
- this check does **not** establish that `torana-site.pages.dev` or `torana.sh`
  serves the revision. Check alias freshness and custom-domain DNS/TLS separately.

The workflow summary links the verified deployment URL. A green build or upload
alone is not deployment verification. Failure after upload does not automatically
roll back; inspect the live result and use Pages deployment history deliberately.
Do not redirect or protect the unique deployment URL with Access without also
updating this verification contract. Failures identify the affected route/header
or metadata check using controlled messages, without logging response bodies,
header values, raw tool output, arbitrary exception messages, or credentials.

For an owner-authorized first upload using local OAuth, build with `npm test`
and deploy from a clean, reviewed checkout with
`npx --no-install wrangler pages deploy --branch main`.
Wrangler prints the deployment URL. Check the public routes and headers before
calling it published; configure Actions secrets for repeatable future updates.

## Optional website analytics

Website analytics uses the official Umami Cloud script with manual, allowlisted
page views and key events. The local Torana proxy is not instrumented by this
integration. `/privacy/` describes the active build's configuration.

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
as the page layout. Disabled builds retain the exact baseline bytes. Enabled
builds add only `https://cloud.umami.is` to `script-src` and
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

After the reviewed production deployment, verify one page view and key event in
the real Umami dashboard, then check that a DNT/GPC browser and the unique Pages
preview URL make no Umami requests. A passing build does not prove live ingestion.
To stop collection, unset `PUBLIC_ANALYTICS_ENABLED` and rebuild/deploy; changing a
build variable alone cannot alter files already served. Do not enable a second
website tracker to answer the same questions.

References: [manual payloads](https://docs.umami.is/docs/tracker-functions),
[tracker configuration](https://docs.umami.is/docs/tracker-configuration),
[metric definitions](https://docs.umami.is/docs/metric-definitions), and the
[official tracker source](https://github.com/umami-software/umami/blob/master/src/tracker/index.ts).

## Connect torana.sh from Spaceship

The registration stays at Spaceship. To use the apex `torana.sh` with Pages:

1. Add `torana.sh` as a Cloudflare zone in the same account as the Pages project.
   Review/import existing DNS records, especially mail records, and resolve any
   existing DNSSEC delegation before changing nameservers.
2. In Spaceship, open **Advanced DNS → torana.sh → Nameservers → Change → Custom
   nameservers**. Use the exact nameservers Cloudflare assigned; do not invent
   names or use the Pages hostname here. Preserve existing service records in
   Cloudflare before saving the switch.
3. In Cloudflare **Workers & Pages → torana-site → Custom domains**, add
   `torana.sh`. Wait for domain activation and the HTTPS certificate, then check
   the homepage, articles, quickstart and registry publicly.

Until that completes, use the actual Pages URL returned by deployment. The site
already uses `https://torana.sh` for canonical/social URLs, so verify those once
the domain is active and before sharing the announcement.

Follow the [Pages custom-domain guide](https://developers.cloudflare.com/pages/configuration/custom-domains/)
and [Spaceship nameserver instructions](https://www.spaceship.com/knowledgebase/connect-domain-custom-nameservers/).
Changing nameservers affects all services for the domain, not just this website.
