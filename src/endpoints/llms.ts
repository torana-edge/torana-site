import { indexedPages } from "../lib/routes";

const modules = import.meta.glob("../pages/**/*.astro");
const SITE = "https://torana.sh";

const REPOSITORIES = [
  ["torana-edge", "https://github.com/torana-edge/torana-edge", "The proxy itself: routing, plugin host, control plane, and CLI."],
  ["torana-plugin-sdk", "https://github.com/torana-edge/torana-plugin-sdk", "Go and Rust SDKs for writing plugins against ABI v1."],
  ["torana-plugins", "https://github.com/torana-edge/torana-plugins", "The official plugin catalogue, one setup guide per plugin."],
  ["torana-site", "https://github.com/torana-edge/torana-site", "Source for this website, including its analytics implementation."],
] as const;

// Injected as /llms.txt, following the llms.txt convention: one plain-text index
// a model or agent can read in a single fetch instead of crawling the nav.
//
// Deliberately states the limits alongside the capabilities. An index that only
// lists strengths teaches a model to describe the project inaccurately, and an
// inaccurate summary is worse for us than no summary.
export function GET() {
  const listed = indexedPages(modules);
  const sections = ["Start here", "Documentation", "Plugins", "Background"] as const;

  const body = `# Torana

> A local-first, programmable reverse proxy for coding agents. Torana runs on
> your machine between a coding harness (Claude Code, Codex, OpenCode, Aider and
> other clients using the same provider APIs) and its model provider. It shows
> the traffic locally, applies policy you configure, and runs WebAssembly plugins
> you explicitly approve. Written in Go; plugins are written in Go or Rust.

Torana is open source and installed by building from source. Requests still go
to whichever provider you configure, including remote ones — running the proxy
locally does not by itself keep data on your machine.

Scope worth stating accurately: plugins are sandboxed WebAssembly with declared
capabilities, and installing a plugin neither enables it nor grants it access.
Protocol bridges can translate between supported inference APIs, but that is
tested contract coverage rather than a claim that every harness, model or
account combination works. The project publishes a measured negative result for
context compaction rather than a savings claim.

${sections
  .map(section => {
    const items = listed
      .filter(page => page.section === section)
      .map(page => `- [${page.title}](${SITE}${page.path}): ${page.summary}`)
      .join("\n");
    return `## ${section}\n\n${items}`;
  })
  .join("\n\n")}

## Source

${REPOSITORIES.map(([name, url, summary]) => `- [${name}](${url}): ${summary}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
