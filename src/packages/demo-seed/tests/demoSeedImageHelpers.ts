import sharp from "sharp";
import { seedDemoImages } from "../index";
import { classifiedsFor, fixture, seededAds, type DemoAccount } from "./demoSeedFixture";

export async function imageBytes(mimeType = "image/jpeg") {
  const image = sharp({ create: { width: 16, height: 16, channels: 3, background: "#8899aa" } });
  return mimeType === "image/png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

/** Removes an ad's photos the way the edit form does, so the next image job uploads them again. */
export async function removeAdPhotos(id: string) {
  const ad = (await seededAds()).find(candidate => candidate.id === id)!;
  const owner = (await fixture<DemoAccount | null>("/find", { uid: ad.userId }))!;
  await (await classifiedsFor(owner.email)).write("ads.update", {
    id,
    advertiserProfileId: ad.advertiserProfileId,
    categoryId: ad.categoryId,
    subcategoryId: ad.subcategoryId,
    title: ad.title,
    text: ad.text,
    images: [],
    observedImageIds: ad.images.map(image => image.id),
  });
}

export async function adPhotos(id: string) {
  return (await seededAds()).find(candidate => candidate.id === id)!.images;
}

export async function seedStoredDemoImages() {
  return seedDemoImages({
    imageSource: {
      async download(source) {
        return { bytes: await imageBytes(source.mimeType), mimeType: source.mimeType };
      },
    },
  });
}
