import { pages, indexed, type SitePage } from "../data/pages";

/** Every route Astro will build from src/pages, derived from the filesystem. */
export function builtRoutes(modules: Record<string, unknown>): string[] {
  const routes = Object.keys(modules).map(file => {
    const relative = file.replace(/^.*\/pages\//, "").replace(/\.astro$/, "");
    if (relative === "index") return "/";
    return `/${relative.replace(/\/index$/, "")}/`;
  });
  return [...new Set(routes)].sort();
}

/**
 * The indexed pages, checked against what actually builds.
 *
 * A generated index is only useful if it is complete, and the failure mode is
 * silent: a new page ships, nothing references it, and the omission surfaces
 * months later as "why was that page never in search". Failing the build is
 * noisy at exactly the moment someone can fix it in one line.
 */
export function indexedPages(modules: Record<string, unknown>): SitePage[] {
  const built = builtRoutes(modules);
  const listed = pages.map(page => page.path).sort();

  const missing = built.filter(route => !listed.includes(route));
  const stale = listed.filter(route => !built.includes(route));
  if (missing.length || stale.length) {
    const problems = [
      missing.length ? `not listed in src/data/pages.ts: ${missing.join(", ")}` : "",
      stale.length ? `listed but not built: ${stale.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(`the page index no longer matches the site — ${problems.join("; ")}`);
  }
  if (!built.length) throw new Error("no routes were discovered; this check has stopped seeing what it guards");
  return indexed;
}
