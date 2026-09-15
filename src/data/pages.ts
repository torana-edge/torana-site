import sdk from "./sdk.json" with { type: "json" };

// The one description of every public page.
//
// `title` and `description` are what the page actually serves: Layout takes
// them from here rather than each page repeating them, so the meta tags, the
// sitemap, /llms.txt and the 404 suggestions cannot drift apart. Before this
// existed, four pages had no description and silently served the homepage's.
//
// Adding a page under src/pages/ without adding it here fails the build. That
// is deliberate: an index nobody updates is worse than no index, because it
// looks authoritative while quietly omitting whatever shipped most recently.
export interface SitePage {
  /** Route as served, always with a trailing slash. */
  path: string;
  /** Short name for link text in indexes. */
  label: string;
  /** Exact <title>. */
  title: string;
  /** Exact <meta name="description">, and the page's line in /llms.txt. */
  description: string;
  /** Grouping for the /llms.txt index. */
  section: "Start here" | "Documentation" | "Plugins" | "Background";
  /** A 404 is not a destination: no canonical URL, no tracker, not indexed. */
  indexed?: false;
}

export const pages: SitePage[] = [
  {
    path: "/",
    label: "Torana",
    title: "Torana — a programmable proxy for coding agents",
    description:
      "Keep your coding agent and model. Observe traffic locally, apply your own policy, and build Go or Rust plugins with Torana, an open-source reverse proxy.",
    section: "Start here",
  },
  {
    path: "/quickstart/",
    label: "Quickstart",
    title: "Quickstart — Torana",
    description: "Install Torana and route a coding agent through your local proxy.",
    section: "Start here",
  },
  {
    path: "/how-it-works/",
    label: "How it works",
    title: "How it works — Torana",
    description:
      "Follow a request through Torana’s local proxy: native routing, opt-in API bridges, shared request formats, WASM plugins, streaming, and local controls.",
    section: "Start here",
  },
  {
    path: "/docs/",
    label: "Docs",
    title: "Docs — Torana",
    description:
      "Torana’s documentation: the quickstart, a request walkthrough, protocol bridges, the support matrix, plugin guides, and the CLI reference.",
    section: "Documentation",
  },
  {
    path: "/docs/protocol-bridges/",
    label: "Protocol bridges",
    title: "Protocol bridges — Torana",
    description:
      "Connect an Anthropic Messages client to a local OpenAI-compatible model server. Configure Torana’s opt-in API translation from the CLI and understand its boundaries.",
    section: "Documentation",
  },
  {
    path: "/docs/support/",
    label: "Support matrix",
    title: "Support matrix — Torana",
    description:
      "The exact provider endpoints, streaming and tool coverage, prompt-cache behavior, harness paths, and plugin SDK maturity Torana supports.",
    section: "Documentation",
  },
  {
    path: "/docs/plugin-installation/",
    label: "Install a plugin",
    title: "Install a plugin — Torana",
    description:
      "Build a Torana plugin from source, review its requested capabilities, and approve the exact bundle on your machine.",
    section: "Plugins",
  },
  {
    path: "/docs/plugin-authoring/",
    label: "Write a plugin",
    title: "Write a plugin — Torana",
    description: `Scaffold a Go or Rust plugin with SDK ${sdk.version}, build its WASM bundle, test it against local scenarios, and approve it in Torana.`,
    section: "Plugins",
  },
  {
    path: "/plugins/",
    label: "Plugin registry",
    title: "Plugin registry — Torana",
    description: "Curated Torana plugins and their requested capability classes.",
    section: "Plugins",
  },
  {
    path: "/plugins/submit/",
    label: "Share a plugin",
    title: "Share a plugin — Torana",
    description:
      "Build a Torana plugin for your workflow, keep it in your own repository, and request a listing in the plugin catalogue.",
    section: "Plugins",
  },
  {
    path: "/blog/",
    label: "Blog",
    title: "Blog — Torana",
    description:
      "Why Torana exists, and what its compaction measurements actually showed — including the result that did not go the way it was meant to.",
    section: "Background",
  },
  {
    path: "/blog/why-torana/",
    label: "This was supposed to be a compactor.",
    title: "This was supposed to be a compactor. — Torana",
    description:
      "A compaction experiment, some architectural scope creep, and the local-first proxy that became Torana.",
    section: "Background",
  },
  {
    path: "/blog/context-compaction-negative-result/",
    label: "The context compaction negative result",
    title: "The context compaction negative result — Torana",
    description:
      "75 sessions across three arms: a DeepSeek compaction experiment that did not establish reliable savings.",
    section: "Background",
  },
  {
    path: "/privacy/",
    label: "Website privacy",
    title: "Website privacy — Torana",
    description:
      "What torana.sh measures, what it leaves out, and how browser privacy preferences are respected.",
    section: "Background",
  },
  {
    path: "/404/",
    label: "Page not found",
    title: "Page not found — Torana",
    description:
      "That page does not exist on torana.sh. The quickstart, documentation index, and plugin registry are linked here.",
    section: "Background",
    indexed: false,
  },
];

const byPath = new Map(pages.map(page => [page.path, page]));

/** The title and description a page serves. Spread into <Layout>. */
export function meta(path: string): { title: string; description: string } {
  const page = byPath.get(path);
  if (!page) throw new Error(`${path} is not listed in src/data/pages.ts`);
  return { title: page.title, description: page.description };
}

/** Pages that belong in the sitemap and /llms.txt. */
export const indexed = pages.filter(page => page.indexed !== false);
