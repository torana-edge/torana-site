# Developing torana.sh

## Local development

```sh
npm ci
npm run dev
```

## Verify changes

```sh
npm test
npm run registry:check -- ../torana-plugins
```

`npm test` runs the unit tests, builds the site, then checks built pages. For a
quick theme/menu check use `npm run test:unit`; `npm run test:built` checks an
existing build. Each palette token uses one `light-dark()` pair, selected by
the system preference or the header control.

For diagram or bridge-guide layout changes, build first, then run the browser regressions:

```sh
npx --no-install playwright-core install chromium
npm run test:layout
```

CI installs Chromium with its Linux dependencies and runs these checks too.
They cover both diagrams in light/dark mode at 320–1920px, including both sides
of the horizontal-layout breakpoint, centered connectors, label overflow, and
changing node heights. They also cover the protocol-bridge guide at 320, 375, 414,
768, and 1280px in both themes: reading-column fit, contained code blocks,
single-line navigation, and keyboard focus. The test server binds only to loopback; browser and server
close afterward. External requests are blocked, so CI verifies the offline font
fallback and cannot send analytics. Also visually check with the hosted fonts
available. To use installed Chrome locally, set `DIAGRAM_BROWSER_CHANNEL=chrome`.

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

When moving or renaming a guide, update its website links too. The SDK version
and ABI values in `src/data/sdk.json` are shared by the authoring and support
pages; review them alongside Edge's SDK dependency when updating those guides.

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

## Content ownership and voice

Use [CONTRIBUTING.md](../CONTRIBUTING.md) for source ownership and update order.
Keep first-use prose direct and useful; explain a boundary where it affects the
reader's next action. APIs and security contracts still need precise terms.
Keep the project and experiments central, without personal promotional bylines.
The informal origin story and negative results are part of the public project.
