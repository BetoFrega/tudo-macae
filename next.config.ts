import type { NextConfig } from "next";
import { webAssetPrefix } from "@tudomacae/www-origin-routing/webAssets";
import { buildDeploymentId } from "./bin/buildDeploymentId";

const deploymentId = buildDeploymentId(new URL(".", import.meta.url));
// The production web Worker build (`bin/deploy-workers-production.mjs`) publishes its
// assets under the prefix the router sends to that Worker; other builds keep `/_next`.
const webAssetRelease = process.env.WEB_ASSET_RELEASE;
if (webAssetRelease !== undefined && !/^[a-f0-9]{40}$/u.test(webAssetRelease)) throw new Error("Invalid web asset release");

const nextConfig: NextConfig = {
  /* config options here */
  ...(webAssetRelease ? { assetPrefix: `${webAssetPrefix}/${webAssetRelease}` } : {}),
  env: {
    NEXT_PUBLIC_APP_RELEASE: deploymentId,
  },
  reactCompiler: true,
  cacheComponents: true,
  // Link readers must receive complete metadata before the document body.
  htmlLimitedBots: /.*/,
  // The proxy distinguishes HTML documents from RSC navigation by its headers.
  skipProxyUrlNormalize: true,
  // A build-derived identity keeps PPR shells and the runtime on one version.
  deploymentId,
  experimental: {
    authInterrupts: true,
    turbopackFileSystemCacheForBuild: true,
  },
  async headers() {
    return [{ source: "/negocio/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "CDN-Cache-Control", value: "no-store" }] }, ...["/", "/noticias"].map(source => ({
      source,
      headers: [{
        key: "Cache-Control",
        value: "public, no-cache, max-age=0, must-revalidate",
      }],
    }))];
  },
  images: { loader: "custom", loaderFile: "./image-loader.js" },
  // Markdown pages import `?raw`, which Vite (vinext) also understands.
  turbopack: { rules: { "*.md": { condition: { query: "?raw" }, type: "text" } } },
};

export default nextConfig;
