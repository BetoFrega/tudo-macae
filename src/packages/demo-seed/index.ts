import {
  shouldSeedDemoData,
  shouldSeedDemoImages,
} from "./lib/environment";
import type { DemoImageSource } from "./image-source";

/** What one call to `seedDemoData` left behind. */
export interface DemoSeedSummary {
  /**
   * `false` when the environment guard declined, and then every count is zero:
   * nothing was read, nothing was written, no seed module was even loaded.
   */
  seeded: boolean;
  /** Accounts the demo mass owns after the run — created plus reused. */
  accounts: number;
  /** Public business records the demo mass owns after the run. */
  businesses: number;
  /** Ads the demo mass owns after the run. */
  ads: number;
  /** Matérias the demo mass owns after the run, as Blog posts — drafts and published alike. */
  articles: number;
}

const NOTHING_SEEDED: DemoSeedSummary = {
  seeded: false,
  accounts: 0,
  businesses: 0,
  ads: 0,
  articles: 0,
};

export interface DemoImageSeedSummary {
  seeded: boolean;
  total: number;
  completed: number;
  skipped: number;
  failed: number;
}

export interface DemoImageSeedOptions {
  /** External content boundary used by alternate job hosts. */
  imageSource?: DemoImageSource;
}

const NO_IMAGES_SEEDED: DemoImageSeedSummary = {
  seeded: false,
  total: 0,
  completed: 0,
  skipped: 0,
  failed: 0,
};

/**
 * Fills the local stack with the demo mass — category catalogue, accounts,
 * businesses, ads and the Matérias as Blog posts, all in the API Worker
 * fixture — so `pnpm run dev` lands on a site that looks used.
 *
 * The single entry point of this package, and it carries its own environment
 * guard: `instrumentation.ts` runs in every environment and in both runtimes,
 * so a caller that had to remember the guard would eventually forget it and
 * write demo data into a real project.
 *
 * Every seed module is behind the `await import` below, after the guard.
 * `register()` also runs in the edge runtime, where those Node modules cannot
 * be bundled; a static import here would pull them in whether or not the guard
 * says yes.
 *
 * Upserts by stable key, so repeating it is safe: a second `next dev` refreshes
 * the demo mass and leaves anything created by hand alone.
 */
export async function seedDemoData(): Promise<DemoSeedSummary> {
  if (!shouldSeedDemoData(process.env)) return NOTHING_SEEDED;

  const { runDemoSeed } = await import("./lib/runDemoSeed");

  return await runDemoSeed();
}

/** Progressively adds curated images after the blocking content seed. */
export async function seedDemoImages(
  options: DemoImageSeedOptions = {},
): Promise<DemoImageSeedSummary> {
  if (!shouldSeedDemoImages(process.env)) return NO_IMAGES_SEEDED;

  const { runDemoImageSeed } = await import("./lib/runDemoImageSeed");

  return await runDemoImageSeed(options);
}
