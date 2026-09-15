import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://torana.sh",
  output: "static",
  integrations: [{
    name: "torana-generated-routes",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        injectRoute({ pattern: "/_headers", entrypoint: "./src/endpoints/security-headers.ts" });
        injectRoute({ pattern: "/sitemap.xml", entrypoint: "./src/endpoints/sitemap.ts" });
        injectRoute({ pattern: "/llms.txt", entrypoint: "./src/endpoints/llms.ts" });
      },
    },
  }],
});
