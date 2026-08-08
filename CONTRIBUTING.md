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
`torana-edge`, then run the owned-content sync here and merge the site update
after the source change.
