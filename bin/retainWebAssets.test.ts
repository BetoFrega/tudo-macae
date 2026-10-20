import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { retainWebAssets, webAssetManifestPath } from "./retain-web-assets.mjs";

const firstRelease = "a".repeat(40);
const secondRelease = "b".repeat(40);
const origin = "https://www.tudomacae.com.br";

function assetPath(release: string) {
  return `/_terms-workers/${release}/_next/static/chunks/app.js`;
}

function writeAsset(directory: string, release: string, content: string) {
  const file = path.join(directory, assetPath(release).slice(1));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test("a later release carries forward earlier versioned assets", async () => {
  const first = mkdtempSync(path.join(tmpdir(), "terms-first-assets-"));
  const second = mkdtempSync(path.join(tmpdir(), "terms-second-assets-"));
  try {
    writeAsset(first, firstRelease, "first build");
    await retainWebAssets({ clientDirectory: first, releaseSha: firstRelease, previousOrigin: origin, previousExists: false });
    const manifest = readFileSync(path.join(first, webAssetManifestPath.slice(1)), "utf8");
    writeAsset(second, secondRelease, "second build");
    const request: typeof fetch = async input => new Response(
      new URL(input instanceof Request ? input.url : String(input)).pathname === webAssetManifestPath ? manifest : "first build",
    );
    const result = await retainWebAssets({ clientDirectory: second, releaseSha: secondRelease,
      previousOrigin: origin, previousExists: true, request });
    expect(result).toEqual({ count: 2, retained: 1 });
    expect(readFileSync(path.join(second, assetPath(firstRelease).slice(1)), "utf8")).toBe("first build");
    expect(JSON.parse(readFileSync(path.join(second, webAssetManifestPath.slice(1)), "utf8")).assets.map((asset: { path: string }) => asset.path))
      .toEqual([assetPath(firstRelease), assetPath(secondRelease)]);
  }
  finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test("a missing previous manifest blocks redeployment", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "terms-missing-assets-"));
  try {
    writeAsset(directory, secondRelease, "second build");
    await expect(retainWebAssets({ clientDirectory: directory, releaseSha: secondRelease,
      previousOrigin: origin, previousExists: true, request: async () => new Response(null, { status: 404 }) }))
      .rejects.toThrow(/previous web assets/);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a missing previous manifest blocks the release", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "terms-unrouted-assets-"));
  try {
    writeAsset(directory, secondRelease, "second build");
    const missing = (origin: string): typeof fetch => async () => new Response(null, { status: 404, headers: { "x-www-origin": origin } });
    await expect(retainWebAssets({ clientDirectory: directory, releaseSha: secondRelease,
      previousOrigin: origin, previousExists: true, request: missing("terms-workers") })).rejects.toThrow(/previous web assets/);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the same asset path cannot silently change bytes", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "terms-collision-assets-"));
  try {
    writeAsset(directory, firstRelease, "changed build");
    const sha256 = createHash("sha256").update("first build").digest("hex");
    const manifest = { schema: 1, assets: [{ path: assetPath(firstRelease), sha256 }] };
    await expect(retainWebAssets({ clientDirectory: directory, releaseSha: firstRelease,
      previousOrigin: origin, previousExists: true, request: async () => Response.json(manifest) }))
      .rejects.toThrow(/changed contents/);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a release keeps only the assets of the release before it", async () => {
  const thirdRelease = "c".repeat(40);
  const directory = mkdtempSync(path.join(tmpdir(), "terms-third-assets-"));
  const digestOf = (content: string) => createHash("sha256").update(content).digest("hex");
  const manifest = JSON.stringify({ schema: 1, releases: [secondRelease, firstRelease], assets: [
    { path: assetPath(firstRelease), sha256: digestOf("first build") },
    { path: assetPath(secondRelease), sha256: digestOf("second build") },
  ] });
  try {
    writeAsset(directory, thirdRelease, "third build");
    const request: typeof fetch = async input => new Response(
      new URL(input instanceof Request ? input.url : String(input)).pathname === webAssetManifestPath ? manifest : "second build",
    );
    const result = await retainWebAssets({ clientDirectory: directory, releaseSha: thirdRelease, previousOrigin: origin, previousExists: true, request });
    expect(result).toEqual({ count: 2, retained: 1 });
    const written = JSON.parse(readFileSync(path.join(directory, webAssetManifestPath.slice(1)), "utf8"));
    expect(written.releases).toEqual([thirdRelease, secondRelease]);
    expect(written.assets.map((asset: { path: string }) => asset.path)).toEqual([assetPath(secondRelease), assetPath(thirdRelease)]);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a manifest without releases keeps every asset it lists", async () => {
  const thirdRelease = "c".repeat(40);
  const directory = mkdtempSync(path.join(tmpdir(), "terms-legacy-assets-"));
  const digestOf = (content: string) => createHash("sha256").update(content).digest("hex");
  const contents = new Map([[assetPath(firstRelease), "first build"], [assetPath(secondRelease), "second build"]]);
  const manifest = JSON.stringify({ schema: 1, assets: [...contents].map(([pathname, content]) => ({ path: pathname, sha256: digestOf(content) })) });
  try {
    writeAsset(directory, thirdRelease, "third build");
    const request: typeof fetch = async (input) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
      return new Response(pathname === webAssetManifestPath ? manifest : contents.get(pathname));
    };
    const result = await retainWebAssets({ clientDirectory: directory, releaseSha: thirdRelease, previousOrigin: origin, previousExists: true, request });
    expect(result).toEqual({ count: 3, retained: 2 });
    const written = JSON.parse(readFileSync(path.join(directory, webAssetManifestPath.slice(1)), "utf8"));
    expect(written.releases).toEqual([thirdRelease]);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
