import { analyticsWebsiteId } from "./analytics-config.mjs";

export const websiteId = analyticsWebsiteId(
  import.meta.env.PROD,
  import.meta.env.PUBLIC_ANALYTICS_ENABLED,
  import.meta.env.PUBLIC_UMAMI_WEBSITE_ID,
);
