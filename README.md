# torana.sh

The public product, documentation, blog, and curated plugin-registry site for Torana.

## Local development

```sh
npm install
npm run dev
```

## Cloudflare Pages

Build command: `npm run build`

Output directory: `dist`

The deployment workflow expects `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
repository secrets. Without both, the workflow still verifies the production build
and emits an explicit deployment-skipped notice; it never claims that a deployment
occurred. Attach the `torana.sh` custom domain in Cloudflare Pages after the first
deployment, then update the domain nameservers or the required CNAME at the registrar.
