// The public route inventory, used to generate /sitemap.xml and /llms.txt.
//
// `summary` is written for a reader who arrives without the surrounding page —
// a search result, an llms.txt index, or an agent fetching one URL. It is not
// the page's meta description, which is written for a human scanning results.
//
// Adding a page under src/pages/ without adding it here fails the build. That
// is deliberate: an index nobody updates is worse than no index, because it
// looks authoritative while quietly omitting whatever shipped most recently.
export interface SitePage {
  /** Route as served, always with a trailing slash. */
  path: string;
  title: string;
  summary: string;
  /** Grouping for the llms.txt index only. */
  section: "Start here" | "Documentation" | "Plugins" | "Background";
}

export const pages: SitePage[] = [
  {
    path: "/",
    title: "Torana",
    summary:
      "A local-first programmable reverse proxy for coding agents. Sits between a coding harness and its model provider, shows the traffic locally, and runs WebAssembly plugins you approve.",
    section: "Start here",
  },
  {
    path: "/quickstart/",
    title: "Quickstart",
    summary:
      "Build Torana from source, configure one provider, send a request through the proxy, and install the usage logger. Requires Git and Go 1.26.6 or newer.",
    section: "Start here",
  },
  {
    path: "/how-it-works/",
    title: "How it works",
    summary:
      "Follows one request through provider routing, the shared request format, plugin hooks, permissions, streaming, and the local control plane, with links to the implementing source.",
    section: "Start here",
  },
  {
    path: "/docs/",
    title: "Documentation index",
    summary: "Entry point to the quickstart, protocol bridges, support matrix, plugin guides, and the CLI reference.",
    section: "Documentation",
  },
  {
    path: "/docs/protocol-bridges/",
    title: "Protocol bridges",
    summary:
      "Opt-in translation between inference APIs: send Anthropic Messages to an OpenAI-compatible backend, for example. Covers configuration, the supported translation surface, and what is deliberately not portable.",
    section: "Documentation",
  },
  {
    path: "/docs/support/",
    title: "Support matrix",
    summary:
      "Which provider endpoints, streaming modes, tool behaviour, prompt-cache semantics, and coding harnesses are supported, and the evidence behind each claim.",
    section: "Documentation",
  },
  {
    path: "/docs/plugin-installation/",
    title: "Plugin installation",
    summary:
      "How plugins are built from source, what permissions they declare, and why installing one does not enable it or grant it access.",
    section: "Plugins",
  },
  {
    path: "/docs/plugin-authoring/",
    title: "Plugin authoring",
    summary: "Writing a Torana plugin in Go or Rust against the WebAssembly SDK, including hooks, write grants, and testing.",
    section: "Plugins",
  },
  {
    path: "/plugins/",
    title: "Plugin registry",
    summary: "The official plugin catalogue with each plugin's purpose, requested permissions, and install command.",
    section: "Plugins",
  },
  {
    path: "/plugins/submit/",
    title: "Share a plugin",
    summary: "How to propose a community plugin for the registry, and what the listing review covers.",
    section: "Plugins",
  },
  {
    path: "/blog/",
    title: "Blog",
    summary: "Written record of why Torana exists and what its measurements actually showed.",
    section: "Background",
  },
  {
    path: "/blog/why-torana/",
    title: "Why Torana",
    summary: "The origin of the project: what problem it started from, what changed along the way, and what it is now for.",
    section: "Background",
  },
  {
    path: "/blog/context-compaction-negative-result/",
    title: "Context compaction: a negative result",
    summary:
      "A measured study of compacting tool output to reduce cost. 75 sessions across three arms established no reliable saving on the tested setup; the median paired saving was $0.000524 with an interval spanning zero. Published because the result was negative.",
    section: "Background",
  },
  {
    path: "/privacy/",
    title: "Privacy",
    summary: "What the website collects, what it deliberately does not, and how the analytics are gated and auditable.",
    section: "Background",
  },
];
