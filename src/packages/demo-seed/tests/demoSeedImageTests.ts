import { expect, test, vi } from "vitest";
import type { DemoImageSource } from "../image-source";
import { seedDemoData, seedDemoImages } from "../index";
import { adPhotos, imageBytes, removeAdPhotos, seedStoredDemoImages } from "./demoSeedImageHelpers";
import { profileTitled, seededAds, seededProfiles } from "./demoSeedFixture";

export function registerImageTests() {
  test("fills or preserves one stored photo for every eligible ad and business", async () => {
    vi.stubEnv("DEMO_SEED_IMAGES", "1");
    const imageSource: DemoImageSource = {
      async download(source) {
        return {
          bytes: await imageBytes(source.mimeType),
          mimeType: source.mimeType,
        };
      },
    };

    const summary = await seedDemoImages({ imageSource });

    expect(summary).toMatchObject({ seeded: true, total: 25, failed: 0 });
    expect(summary.completed + summary.skipped).toBe(25);

    const ads = await seededAds();
    expect(ads).toHaveLength(16);
    for (const ad of ads) {
      expect(ad.images).toHaveLength(1);
      expect(ad.images[0]!.path).not.toMatch(/^https?:/);
      expect(ad.images[0]!.title).toEqual(expect.any(String));
    }

    const profiles = await seededProfiles();
    expect(profileTitled(profiles, "Marcenaria Nunes").photoPath).toBeUndefined();
    const picturedProfiles = profiles.filter(profile => typeof profile.photoPath === "string");
    expect(picturedProfiles).toHaveLength(9);
    for (const profile of picturedProfiles) {
      expect(profile.photoPath).not.toMatch(/^https?:/);
    }
  }, 120_000);

  test("a resumed image job skips completed items without downloading them again", async () => {
    vi.stubEnv("DEMO_SEED_IMAGES", "1");
    const imageSource: DemoImageSource = {
      async download() {
        throw new Error("A completed item must not be downloaded again.");
      },
    };

    const summary = await seedDemoImages({ imageSource });

    expect(summary).toEqual({
      seeded: true,
      total: 25,
      completed: 0,
      skipped: 25,
      failed: 0,
    });
    expect((await seededAds()).every(ad => ad.images.length === 1)).toBe(true);
    expect((await seededProfiles()).filter(profile => profile.photoPath)).toHaveLength(9);
  });

  test("a later content-only boot preserves completed photo references", async () => {
    const adsBefore = new Map(
      (await seededAds()).map(ad => [ad.id, ad.images]),
    );
    const profilesBefore = new Map(
      (await seededProfiles()).map(profile => [profile.id, profile.photoPath]),
    );
    vi.stubEnv("DEMO_SEED_IMAGES", undefined);

    await seedDemoData();

    expect(new Map((await seededAds()).map(ad => [ad.id, ad.images])))
      .toEqual(adsBefore);
    expect(new Map((await seededProfiles()).map(profile => [profile.id, profile.photoPath])))
      .toEqual(profilesBefore);
  }, 120_000);

  test("records a definitive item failure and continues with the rest of the batch", async () => {
    vi.stubEnv("DEMO_SEED_IMAGES", "1");
    await seedStoredDemoImages();
    await removeAdPhotos("demo-imperial-kitnet-centro");
    await removeAdPhotos("demo-imperial-apto-granja");
    const logFailure = vi.spyOn(console, "error").mockImplementation(() => {});
    const imageSource: DemoImageSource = {
      async download(source) {
        if (source.key === "ad-imperial-kitnet-centro") {
          throw new Error("source unavailable");
        }
        return { bytes: await imageBytes(source.mimeType), mimeType: source.mimeType };
      },
    };

    try {
      const summary = await seedDemoImages({ imageSource });

      expect(summary).toMatchObject({ completed: 1, skipped: 23, failed: 1 });
      expect(await adPhotos("demo-imperial-kitnet-centro")).toEqual([]);
      expect(await adPhotos("demo-imperial-apto-granja")).toHaveLength(1);
      expect(logFailure).toHaveBeenCalledWith(
        expect.stringContaining("ad-imperial-kitnet-centro failed from https://"),
        expect.any(Error),
      );
      expect(logFailure.mock.calls[0]?.[0]).toContain("/bug-report");
    }
    finally {
      logFailure.mockRestore();
      await seedStoredDemoImages();
    }
  });
}
