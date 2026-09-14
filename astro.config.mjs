import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://torana.sh",
  output: "static",
  integrations: [{
    name: "cloudflare-security-headers",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        injectRoute({ pattern: "/_headers", entrypoint: "./src/endpoints/security-headers.ts" });
      },
    },
  }],
});
