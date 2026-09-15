# torana.sh

Torana's public website: product introduction, quickstart, plugin catalogue,
technical guides and the experiments behind the project.

## Develop

```sh
npm ci
npm run dev
```

## Check

```sh
npm test
npm run registry:check -- ../torana-plugins
npm run owned-content:check -- ../torana-edge
npm run sdk-docs:check -- ../torana-edge ../torana-plugin-sdk
npm run edge-links:check -- ../torana-edge
```

Read [development and visual checks](docs/DEVELOPMENT.md),
[content ownership](CONTRIBUTING.md), [deployment](docs/DEPLOYMENT.md), and
[aggregate analytics](docs/ANALYTICS.md).

The site introduces the product; owning repositories hold the detailed
operator, SDK and per-plugin references. Keep those links useful and the first
steps short. Do not advertise an install artifact or capability that the
corresponding source/release does not provide.
