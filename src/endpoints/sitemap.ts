import { indexedPages } from "../lib/routes";

const modules = import.meta.glob("../pages/**/*.astro");
const SITE = "https://torana.sh";

// Injected as /sitemap.xml. Written by hand rather than via @astrojs/sitemap:
// the inventory is small, the dependency is not free, and generating it from
// src/data/pages.ts keeps one source of truth shared with /llms.txt.
export function GET() {
  const urls = indexedPages(modules)
    .map(page => `  <url><loc>${SITE}${page.path}</loc></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
