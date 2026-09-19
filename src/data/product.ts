// Product facts repeated across the rendered pages, the agent index and the
// structured metadata. Each fact is written once here; presentation stays with
// the consumer, which is why this file holds values rather than sentences.
//
// The previous shape had the same facts restated in llms.ts prose and in the
// Layout's JSON-LD, so a correction to one left the others quietly wrong.

/** Repository roles, in the order a newcomer should meet them. */
export const repositories = [
  { name: "torana-edge", role: "The proxy itself: routing, plugin host, control plane, and CLI." },
  { name: "torana-plugin-sdk", role: "Go and Rust SDKs for writing plugins against ABI v1." },
  { name: "torana-plugins", role: "Maintained plugin examples, with one setup guide per plugin." },
  { name: "torana-site", role: "Source for this website, including its analytics implementation." },
] as const;

export const product = {
  name: "Torana",
  url: "https://torana.sh/",

  /** The proxy is a native Go program. Plugins are a separate runtime; see below. */
  language: "Go",
  repository: "https://github.com/torana-edge/torana-edge",
  license: "https://github.com/torana-edge/torana-edge/blob/main/LICENSE",
  licenseName: "Apache-2.0",
  operatingSystems: ["Linux", "macOS", "Windows"],

  /** Plugins are compiled to WebAssembly and run sandboxed inside the proxy. */
  pluginLanguages: ["Go", "Rust"],
  pluginRuntime: "WebAssembly",

  /** No tagged release yet: the documented path is a source build. */
  installation: "source" as const,

  /** One sentence, used wherever the project must introduce itself. */
  summary:
    "An open-source reverse proxy that runs on your own machine between a coding agent and its model provider. It records traffic locally, applies configured policy, and runs sandboxed WebAssembly plugins that must be explicitly approved.",

  /**
   * Scope limits stated wherever the project describes itself. A summary that
   * lists only capabilities teaches an inaccurate description of the project,
   * and an inaccurate summary is worse for us than no summary.
   */
  limits: [
    "Requests still go to whichever provider you configure, including remote ones — running the proxy locally does not by itself keep data on your machine.",
    "Plugins are sandboxed WebAssembly with declared capabilities, and installing one neither enables it nor grants it access.",
    "Protocol bridges translate between supported inference APIs, but that is tested contract coverage rather than a claim that every harness, model or account combination works.",
    "Context compaction has a published measured negative result rather than a savings claim.",
  ],
} as const;

export const repositoryURL = (name: string) => `https://github.com/torana-edge/${name}`;
