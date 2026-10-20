/**
 * Pure logic behind the "stale `.next/` build" preflight check in
 * `tests/e2e/_helpers/global-setup.ts`. Split out so the extraction and the
 * pass/fail decision are unit-testable without a running server.
 *
 * See docs/agents/test-harness-operation.md.
 */

/**
 * Matches a `/_next/static/...` URL up to the first character that cannot be
 * part of one. The App Router emits the same URL twice — once in a normal
 * `src`/`href` attribute, once escaped inside the flight payload as
 * `\"/_next/static/...\"` — so the stop set includes `\` and `"` alongside the
 * usual attribute delimiters; without it the escaped form's URL would swallow
 * the trailing backslash that isn't actually part of it.
 */
const ASSET_URL_PATTERN = /\/_next\/static\/[^\s"'\\<>)]+/g;
const ASSET_FILE_PATTERN = /\/[^/?]+\.[a-z0-9]+(?:\?|$)/i;

/** Distinct `/_next/static/...` URLs referenced by a page's HTML. */
export function extractStaticAssetUrls(html: string): string[] {
  const matches = html.match(ASSET_URL_PATTERN) ?? [];
  // Flight payloads can split an asset URL across stream fragments. A bare
  // prefix is not a requestable file and must not fail the build preflight.
  return [...new Set(matches.filter(url => ASSET_FILE_PATTERN.test(url)))];
}

/** The first URL whose status is not 200, or `undefined` if all are. */
export function firstBrokenAsset(
  statuses: ReadonlyMap<string, number>,
): string | undefined {
  for (const [url, status] of statuses) {
    if (status !== 200) return url;
  }
  return undefined;
}
