import type { AdData, AdImage } from "@tudomacae/ads/types";
import { z } from "zod";
import type { StoredRecord } from "@tudomacae/classifieds-persistence";
import { AdvertiserProfileAccessError } from "@tudomacae/advertiser-identity/profiles";
import { asBody } from "@tudomacae/classifieds-persistence/records";
import { jsonValue, parseStored } from "./classifiedsSupport";

export const adSchema = z.looseObject({
  userId: z.string(), title: z.string().default(""), text: z.string(), slug: z.string().default(""),
  categoryId: z.string(), subcategoryId: z.string(), advertiserProfileId: z.string().optional(),
  status: z.enum(["active", "paused"]), createdAt: z.number(), updatedAt: z.number().optional(),
  revision: z.number().int().positive().default(1), publicationState: z.string().optional(), deleting: z.boolean().optional(),
  images: z.array(z.looseObject({ id: z.string(), path: z.string(), order: z.number(), title: z.string().optional(), description: z.string().optional(), pending: z.boolean().optional() })).default([]),
  pendingImageCleanupPaths: z.array(z.string()).optional(), pendingImageCleanupClaims: z.array(z.string()).optional(),
  pendingImageUploadReservations: z.array(z.object({ path: z.string(), expiresAt: z.number().optional() })).optional(),
});
export const body = (value: unknown) => asBody(jsonValue(value));
export const data = (record: StoredRecord) => ({ ...parseStored(adSchema, record.body), id: record.id });
export type StoredAd = ReturnType<typeof data>;
export function forbidden(): never {
  throw new AdvertiserProfileAccessError("forbidden");
}

export function publicAd(value: StoredAd, images: AdImage[]): AdData {
  return {
    id: value.id, userId: value.userId, title: value.title, text: value.text, slug: value.slug,
    categoryId: value.categoryId, subcategoryId: value.subcategoryId,
    advertiserProfileId: value.advertiserProfileId ?? "", status: value.status, createdAt: value.createdAt,
    ...(value.updatedAt === undefined ? {} : { updatedAt: value.updatedAt }),
    images: images.map(image => ({ id: image.id, path: image.path, order: image.order,
      ...(image.url === undefined ? {} : { url: image.url }),
      ...(image.title === undefined ? {} : { title: image.title }),
      ...(image.description === undefined ? {} : { description: image.description }),
    })),
  };
}
