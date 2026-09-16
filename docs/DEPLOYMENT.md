# Deploying torana.sh

The site is a static Astro build on Cloudflare Pages, not a Worker. The build
derives Markdown sidecars from the rendered HTML pages; a small Pages Function
selects those sidecars only for canonical page routes when `Accept` prefers
`text/markdown`. Cloudflare's paid Markdown for Agents/content converter is not
required or configured.
`wrangler.jsonc` names `torana-site` and uses `./dist`.
GitHub Actions owns production deployment; do not configure a second
Git-integrated deploy pipeline for the same Pages project.

## Required configuration

The repository's Actions secrets are `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. Restrict the token to Cloudflare Pages Edit for the
intended account. Local Wrangler OAuth does not authorize Actions.
Enter secrets directly in secret storage, never in source, logs or issues.

The Pages project and custom domain must already be configured in the intended
account. Follow [Cloudflare's Pages guide](https://developers.cloudflare.com/pages/configuration/custom-domains/)
for a new deployment; preserve existing DNS and mail services when changing
domains or nameservers.

## Publish and verify

The **Deploy website** workflow runs on main pushes, or can be dispatched manually
on main from Actions. It rejects other refs and missing credentials, installs the
lockfile dependencies, runs `npm test`, and uploads the tested `dist` to the Pages
production branch with the exact Git commit recorded.

The final step consumes Wrangler's structured deployment output and verifies:

- the project, production environment, and commit match;
- ten routes at the unique deployment URL serve bytes identical to the build, including the homepage,
  quickstart, technical guide, both articles, registry, scripts, and social image; the homepage Markdown
  variant is fetched with `Accept: text/markdown` and checked against its generated sidecar;
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

For a separately authorized manual deployment from a clean reviewed checkout,
run `npm test`, then `npx --no-install wrangler pages deploy --branch main`.
Verify the resulting deployment and custom-domain routes before calling it live.
Do not use `wrangler deploy`, which targets Workers.

Analytics build settings and integrity-pin maintenance are in
[ANALYTICS.md](ANALYTICS.md). Website publication is independent of a binary
release: update install copy only after Edge's actual release and installer
verification, not merely because the website deployed.
