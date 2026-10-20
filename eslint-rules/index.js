/**
 * Rules that only make sense inside this repo, registered under the `local`
 * namespace in eslint.config.mjs.
 */

import maxFileBytes from "./max-file-bytes.js";
import noExpiredNotes from "./no-expired-notes.js";
import noFixedPosthogDistinctId from "./no-fixed-posthog-distinct-id.js";
import noPortugueseIdentifiers from "./no-portuguese-identifiers.js";
import noPositionalPlaywrightLocators from "./no-positional-playwright-locators.js";
import noRawPlaywrightPageSelectors from "./no-raw-playwright-page-selectors.js";
import noRawCustomClaims from "./no-raw-custom-claims.js";
import noStrykerIgnoreStatic from "./no-stryker-ignore-static.js";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: {
    name: "local",
  },
  rules: {
    "max-file-bytes": maxFileBytes,
    "no-expired-notes": noExpiredNotes,
    "no-fixed-posthog-distinct-id": noFixedPosthogDistinctId,
    "no-portuguese-identifiers": noPortugueseIdentifiers,
    "no-positional-playwright-locators": noPositionalPlaywrightLocators,
    "no-raw-playwright-page-selectors": noRawPlaywrightPageSelectors,
    "no-raw-custom-claims": noRawCustomClaims,
    "no-stryker-ignore-static": noStrykerIgnoreStatic,
  },
};

export default plugin;
