import { indexedPages } from "../lib/routes";
import { product, repositories, repositoryURL } from "../data/product";

const modules = import.meta.glob("../pages/**/*.astro");

// Injected as /llms.txt, following the llms.txt convention: one plain-text index
// a model or agent can read in a single fetch instead of crawling the nav.
//
// Product facts come from src/data/product.ts, the same source the page's
// structured metadata uses. Only the framing is written here, so a corrected
// fact cannot stay right in one place and wrong in the other.
export function GET() {
  const listed = indexedPages(modules);
  const sections = ["Start here", "Documentation", "Plugins", "Background"] as const;
  const install =
    product.installation === "source"
      ? "installed by building from source"
      : "installed from a published release";

  const body = `# ${product.name}

> ${product.summary}
> Written in ${product.language}; plugins are written in ${product.pluginLanguages.join(" or ")}
> and compiled to ${product.pluginRuntime}. Runs on ${product.operatingSystems.join(", ")}.

${product.name} is open source under ${product.licenseName} and ${install}.

Scope worth stating accurately:

${product.limits.map(limit => `- ${limit}`).join("\n")}

${sections
  .map(section => {
    const items = listed
      .filter(page => page.section === section)
      .map(page => `- [${page.label}](${product.url.replace(/\/$/, "")}${page.path}): ${page.description}`)
      .join("\n");
    return `## ${section}\n\n${items}`;
  })
  .join("\n\n")}

## Source

${repositories.map(({ name, role }) => `- [${name}](${repositoryURL(name)}): ${role}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
