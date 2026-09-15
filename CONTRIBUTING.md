# Contributing

## Generated registry ownership

The committed plugin registry is downstream of
[`torana-plugins`](https://github.com/torana-edge/torana-plugins). Do not edit
`public/registry/v1/index.json` by hand.

When a published plugin's `plugin.json` changes:

1. merge the owning `torana-plugins` change first;
2. regenerate the registry from that merged revision with `npm run registry:sync`;
3. merge the `torana-site` change last.

CI checks the committed registry against `torana-plugins@main`. The ordering is
intentionally one-way: a site PR generated from an unmerged plugin branch must
fail until the owning repository lands. The auth reference plugin is the sole
deliberate registry exclusion, and the generator asserts that inventory.

Quickstart command snippets follow the same ownership rule: edit them in
`torana-edge`, update `src/data/install.ts` here, run
`npm run owned-content:check -- ../torana-edge`, and merge after the source change.

## Human-readable catalogue copy

`src/data/plugin-copy.json` owns short titles/descriptions and setup-guide links.
It is presentation copy, not a second manifest. `check:plugin-copy` requires
exactly one entry per generated catalogue name and a link to its owning guide.
Do not edit digest-bound manifests just to polish a website sentence.
Source coordinates, permissions, conflicts and failure modes still come from
the generated registry, whose API remains unchanged.

## Further guidance

- [Development, visual and content checks](docs/DEVELOPMENT.md).
- [Deployment and verification](docs/DEPLOYMENT.md).
- [Aggregate analytics and privacy checks](docs/ANALYTICS.md).

Operator instructions belong in Edge, authoring in the SDK, individual behavior
in Plugins. Keep website summaries concise and link to the owner. Internal
release coordination and account-bootstrap history do not belong in these
public guides.
