import type {
  DemoImageSeedOptions,
  DemoImageSeedSummary,
} from "../index";
import { createDemoImageSource } from "../image-source";
import { curatedDemoImages } from "./data/images";
import { seedClassifiedsImage } from "./classifiedsImages";

export async function runDemoImageSeed(
  options: DemoImageSeedOptions,
): Promise<DemoImageSeedSummary> {
  const total = curatedDemoImages.length;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const imageSource = options.imageSource ?? createDemoImageSource();

  console.log(`Starting demo image seeding — ${total} curated images.`);

  for (const [index, image] of curatedDemoImages.entries()) {
    try {
      const state = await seedClassifiedsImage(image, imageSource);

      if (state === "complete") skipped += 1;
      else completed += 1;

      console.log(
        `Demo images ${index + 1}/${total} — ${image.key} ${state === "complete" ? "skipped" : "ready"}.`,
      );
    }
    catch (error) {
      failed += 1;
      console.error(
        `Demo images ${index + 1}/${total} — ${image.key} failed from ${image.url}. Run /bug-report to verify the source, look for a duplicate and record the defect with evidence.`,
        error,
      );
    }
  }

  console.log(
    `Demo image seeding finished — ${completed} completed, ${skipped} skipped, ${failed} failed.`,
  );

  return { seeded: true, total, completed, skipped, failed };
}
