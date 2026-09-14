# torana.sh

The public product, documentation, blog, and curated plugin-registry site for Torana.

## Local development

```sh
npm install
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

## Cloudflare Pages

Build command: `npm run build`

Output directory: `dist`

The deployment workflow expects `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
repository secrets. Without both, the workflow still verifies the production build
and emits an explicit deployment-skipped notice; it never claims that a deployment
occurred. Attach the `torana.sh` custom domain in Cloudflare Pages after the first
deployment, then update the domain nameservers or the required CNAME at the registrar.
