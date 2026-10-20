import type { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Gives one-off spec interactions the same visible-selector boundary as named
 * Page Objects. Reusable journeys and collections still belong in semantic
 * Page Object methods.
 */
export function pageObject(page: Page) {
  return new BasePage(page);
}
