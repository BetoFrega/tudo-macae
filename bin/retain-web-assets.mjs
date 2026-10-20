import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { webAssetPrefix, webAssetManifestPath, webAssetPathPattern } from "@tudomacae/www-origin-routing/webAssets";
export { webAssetManifestPath } from "@tudomacae/www-origin-routing/webAssets";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetFile(clientDirectory, pathname) {
  if (!webAssetPathPattern.test(pathname) || pathname.split("/").includes("..")) {
    throw new Error("Invalid retained web asset path");
  }
  return path.join(clientDirectory, pathname.slice(1));
}

function listAssets(directory, root = directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listAssets(file, root) : [`/${path.relative(root, file).split(path.sep).join("/")}`];
  });
}

async function downloadPreviousAsset(file, entry, previousOrigin, request) {
  const response = await request(new URL(entry.path, previousOrigin), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Could not retain web asset: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10_000_000) throw new Error("Retained web asset exceeds size limit");
  if (digest(bytes) !== entry.sha256) throw new Error("Retained web asset checksum mismatch");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return bytes;
}

function isValidManifestEntry(entry) {
  return typeof entry?.path === "string" && webAssetPathPattern.test(entry.path)
    && !entry.path.split("/").includes("..") && /^[a-f0-9]{64}$/u.test(entry.sha256);
}

function isValidAssetManifest(manifest) {
  return manifest?.schema === 1 && Array.isArray(manifest.assets) && manifest.assets.length <= 20_000
    && manifest.assets.every(isValidManifestEntry);
}

function addCurrentAssets(assets, clientDirectory, current) {
  for (const pathname of current) {
    const sha256 = digest(readFileSync(assetFile(clientDirectory, pathname)));
    if (assets.has(pathname) && assets.get(pathname) !== sha256) throw new Error("web asset path changed contents");
    assets.set(pathname, sha256);
  }
}

// A browser holds the assets of the release it loaded, so a deploy keeps the one before
// it. Keeping every release would pass the manifest's 20,000-entry limit within about ten
// releases of the whole app, whose build emits about 2,000 assets.
const retainedReleases = 1;
const downloadConcurrency = 16;

const releaseOf = pathname => pathname.split("/")[2];

/** Releases newest first, or undefined for a manifest written before `releases`, whose paths do not say which release is served. */
function previousReleases(manifest) {
  return Array.isArray(manifest.releases) && manifest.releases.every(release => /^[a-f0-9]{40}$/u.test(release))
    ? manifest.releases
    : undefined;
}

async function eachConcurrently(items, limit, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++]);
  }));
}

export async function retainWebAssets({ clientDirectory, releaseSha, previousOrigin, previousExists, request = fetch }) {
  if (!/^[a-f0-9]{40}$/u.test(releaseSha)) throw new Error("Invalid web asset release");
  const prefix = `${webAssetPrefix}/${releaseSha}/_next/static/`;
  const current = listAssets(path.join(clientDirectory, prefix.slice(1))).map(asset => `${prefix}${asset.slice(1)}`);
  if (current.length === 0) throw new Error("Web build emitted no versioned assets");

  const manifestBefore = previousExists ? await loadPreviousManifest() : { assets: [], releases: [] };
  const releases = previousReleases(manifestBefore);
  const kept = (releases ?? []).filter(release => release !== releaseSha).slice(0, retainedReleases);
  // A legacy manifest keeps all its assets once, since any of its releases may be the one served.
  // A redeploy of the same release still proves its paths kept their bytes.
  const previous = releases
    ? manifestBefore.assets.filter(entry => [releaseSha, ...kept].includes(releaseOf(entry.path)))
    : manifestBefore.assets;
  const assets = new Map();
  await eachConcurrently(previous, downloadConcurrency, async (entry) => {
    const file = assetFile(clientDirectory, entry.path);
    const bytes = existsSync(file) ? readFileSync(file) : await downloadPreviousAsset(file, entry, previousOrigin, request);
    if (digest(bytes) !== entry.sha256) throw new Error("web asset path changed contents");
    assets.set(entry.path, entry.sha256);
  });
  addCurrentAssets(assets, clientDirectory, current);
  const manifest = {
    schema: 1,
    releases: [releaseSha, ...kept],
    assets: [...assets].sort(([a], [b]) => a.localeCompare(b)).map(([pathname, sha256]) => ({ path: pathname, sha256 })),
  };
  const manifestFile = path.join(clientDirectory, webAssetManifestPath.slice(1));
  mkdirSync(path.dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
  return { count: manifest.assets.length, retained: previous.length };

  async function loadPreviousManifest() {
    const response = await request(new URL(webAssetManifestPath, previousOrigin), {
      headers: { "accept": "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Could not read previous web assets: HTTP ${response.status}`);
    const manifest = await response.json();
    if (!isValidAssetManifest(manifest)) throw new Error("Invalid previous web asset manifest");
    return manifest;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.CLOUDFLARE_ENV !== "production" || !process.argv.includes("--bootstrap")) {
    throw new Error("Direct web asset preparation requires the first production bootstrap");
  }
  const result = await retainWebAssets({
    clientDirectory: "dist/client",
    releaseSha: process.env.RELEASE_SHA,
    previousOrigin: "https://www.tudomacae.com.br",
    previousExists: false,
  });
  console.log(JSON.stringify(result));
}
