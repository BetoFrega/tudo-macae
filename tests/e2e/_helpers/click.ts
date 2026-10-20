import { expect, type Locator } from "@playwright/test";

const attemptTimeout = 2000;

type ClickOptions = {
  /**
   * Called before an attempt when the target is not visible — e.g. to reopen a
   * dropdown that a swallowed click closed.
   */
  ensureVisible?: () => Promise<void>;
};

/** React attaches `__reactProps` to every element it hydrates; vinext hydrates later than `next start`. */
export async function waitForHydration(locator: Locator) {
  await expect.poll(() => locator.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
}

/**
 * Clicks `locator`, and when it targets an in-app link, waits for the
 * navigation to actually land before returning.
 *
 * A click that arrives before React has hydrated a `<Link>` is swallowed by
 * the half-attached handler without navigating. Partial Prerendering paints
 * the static shell — links included — long before hydration finishes, so this
 * happens routinely against `next start`. The failure mode is nasty because it
 * is silent: the *next* step runs against the previous page and fails much
 * later with a confusing "element not found".
 *
 * Whether a given click navigates cannot be decided statically, which is why
 * it is decided here at runtime, by inspecting the element.
 */
export async function click(locator: Locator, options: ClickOptions = {}) {
  const page = locator.page();
  const { ensureVisible } = options;

  if (ensureVisible && !(await locator.isVisible())) {
    await ensureVisible();
  }

  const [href, target] = await Promise.all([
    locator.getAttribute("href"),
    locator.getAttribute("target"),
  ]);

  const isInAppLink
    = href !== null
      && target !== "_blank"
      && !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href); // absolute, mailto:, tel:, …

  if (!isInAppLink) {
    await locator.click();
    return;
  }

  const destination = new URL(href, page.url()).pathname;

  // Same-page link: there is no navigation to wait for, and waiting for a URL
  // that already matches would pass without proving the click landed.
  if (destination === new URL(page.url()).pathname) {
    await locator.click();
    return;
  }

  const hasArrived = (url: URL) => url.pathname === destination;

  // A navigation started by an earlier attempt can land after that attempt's
  // wait expired, so each attempt clicks only while the page is still away
  // from the destination, and every attempt ends by waiting for the
  // destination's `load`. The click bound covers a link that vanished because
  // an earlier navigation already landed. A document navigation still in
  // flight is not re-clicked: Playwright holds the locator until it finishes
  // (see click-readiness.spec.ts).
  await expect(async () => {
    if (!hasArrived(new URL(page.url()))) {
      if (ensureVisible && !(await locator.isVisible())) {
        await ensureVisible();
      }
      await locator.click({ timeout: attemptTimeout });
    }
    await page.waitForURL(hasArrived, { timeout: attemptTimeout });
  }).toPass({ timeout: 15_000 });
}
