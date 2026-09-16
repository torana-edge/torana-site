import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toMarkdown } from "../src/lib/markdown-converter.mjs";
import { headersForURL } from "./verify-cloudflare-deployment.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(projectRoot, "../dist");
const markdownRoot = path.join(distRoot, "_markdown");

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "_markdown") files.push(...await htmlFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
  }
  return files;
}

function routeForFile(file) {
  const relative = path.relative(distRoot, file).split(path.sep).join("/");
  if (relative === "404.html") return null;
  if (relative === "index.html") return "/";
  if (!relative.endsWith("/index.html")) return null;
  return `/${relative.slice(0, -"index.html".length)}`;
}

async function writeRuntimeHeaders(source, routes) {
  // Keep the route matching and detach behavior identical to deployment
  // verification. This artifact is emitted under dist, not functions/, so a
  // build with different analytics flags cannot leave stale source behind.
  const headers = Object.fromEntries(Object.keys(routes).map(route => [
    route,
    headersForURL(source, new URL(route, "https://torana.sh")),
  ]));
  await writeFile(path.join(markdownRoot, "runtime-headers.json"), `${JSON.stringify(headers, null, 2)}\n`);
}

async function main() {
  const files = await htmlFiles(distRoot);
  const routes = {};
  await mkdir(markdownRoot, { recursive: true });
  for (const file of files) {
    const route = routeForFile(file);
    if (!route) continue;
    const relative = route === "/" ? "index.md" : `${route.slice(1)}index.md`;
    const target = path.join(markdownRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, toMarkdown(await readFile(file, "utf8"), route));
    routes[route] = `/_markdown/${relative}`;
  }
  await writeFile(path.join(markdownRoot, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`);
  await writeFile(path.join(distRoot, "_routes.json"), `${JSON.stringify({ version: 1, include: Object.keys(routes), exclude: [] }, null, 2)}\n`);
  await writeRuntimeHeaders(await readFile(path.join(distRoot, "_headers"), "utf8"), routes);
  console.log(`Generated ${Object.keys(routes).length} Markdown page variants.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { routeForFile };
