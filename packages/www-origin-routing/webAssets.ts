/** Published paths stay stable across releases and flag-off recovery. */
export const webAssetPrefix = "/_terms-workers";
export const webAssetManifestPath = `${webAssetPrefix}/assets-v1.json`;
export const webAssetPathPattern = /^\/_terms-workers\/[a-f0-9]{40}\/_next\/static\/[A-Za-z0-9/_.-]+$/u;
