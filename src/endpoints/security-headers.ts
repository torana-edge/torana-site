import baseline from "../config/security-headers.txt?raw";
import { analyticsHeaders } from "../lib/analytics-config.mjs";
import { websiteId } from "../lib/analytics";

// Injected as /_headers: Astro ignores underscore-prefixed filesystem routes.
export function GET() {
  return new Response(analyticsHeaders(baseline, websiteId));
}
