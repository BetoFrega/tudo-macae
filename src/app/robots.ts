import type { MetadataRoute } from "next";
import { CANONICAL_APP_ORIGIN } from "../../bin/appOrigin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: [`${CANONICAL_APP_ORIGIN}/sitemap.xml`, `${CANONICAL_APP_ORIGIN}/sitemaps/anuncios.xml`],
  };
}
