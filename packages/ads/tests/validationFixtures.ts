import type { z } from "zod";
import { expect } from "vitest";

/** Asserts the schema accepts the input, and returns what it parsed. */
export function accept<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  // The assertion is what reports *why* a rejection happened; the throw only
  // narrows `result.data` away from `undefined` and is unreachable past it.
  expect(result.error?.issues ?? []).toEqual([]);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/** Drops one key, keeping the object typed. */
export function omit<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const { [key]: _dropped, ...rest } = source;
  return rest;
}

/** Asserts the schema rejects the input, and returns `path`/`code` per issue. */
export function reject<T extends z.ZodType>(schema: T, input: unknown) {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success
    ? []
    : result.error.issues.map(issue => ({
        path: issue.path,
        code: issue.code,
      }));
}

/** What every ad carries; the schemas differ only in which id they add. */
const validAdFields = {
  categoryId: "category-1",
  subcategoryId: "subcategory-1",
  title: "Bicicleta usada em bom estado",
  text: "Bicicleta de alumínio, quadro 17, com nota fiscal.",
};

export const validCreateInput = {
  ...validAdFields,
  advertiserProfileId: "profile-1",
};

export const validUpdateInput = {
  ...validAdFields,
  id: "ad-1",
};

export const validImage = {
  id: "image-1",
  path: "ads/ad-1/image-1.jpg",
  order: 0,
};
