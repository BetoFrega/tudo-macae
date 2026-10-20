import type { NextConfig } from "next";
import { webAssetPrefix } from "@tudomacae/www-origin-routing/webAssets";

const release = process.env.RELEASE_SHA ?? "development";
if (!/^(?:[a-f0-9]{40}|development)$/u.test(release)) throw new Error("Invalid web asset release");

const config: NextConfig = {
  assetPrefix: `${webAssetPrefix}/${release}`,
};

export default config;
