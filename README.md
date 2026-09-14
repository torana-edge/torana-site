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

Social cards live in `public/social/`: editable SVG sources and matching 1200×630
PNG exports. Keep each pair in sync; pages link to the PNG for social previews.
The origin and compaction articles have their own cards.

Before announcing the release, replace development-source installation with the
verified tag instructions in Edge and `src/data/install.ts` together, then update
the support matrix with the actual manual-test results. The owned-content check
currently enforces pre-release language and will need to evolve with that change.
Review the first-person origin article with Aniket and add the real release demo;
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
3. For GitHub deployment, create an API token with **Account → Cloudflare Pages →
   Edit**, restricted to that account. Add `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` in the repository's **Settings → Secrets and variables →
   Actions**. Local OAuth login does not supply credentials to GitHub Actions.
   Enter values directly into secret storage, never a commit, issue, or chat.

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
- eight public routes serve bytes identical to the build, including the homepage,
  quickstart, both articles, registry, scripts, and social image;
- the homepage serves the security headers from `public/_headers`.

The workflow summary links the verified deployment URL. A green build or upload
alone is not deployment verification. Failure after upload does not automatically
roll back; inspect the live result and use Pages deployment history deliberately.
Do not redirect or protect the unique deployment URL with Access without also
updating this verification contract. Custom-domain checks remain separate.

For an owner-authorized first upload using local OAuth, build with `npm test`
and deploy from a clean, reviewed checkout with
`npx --no-install wrangler pages deploy --branch main`.
Wrangler prints the deployment URL. Check the public routes and headers before
calling it published; configure Actions secrets for repeatable future updates.

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
