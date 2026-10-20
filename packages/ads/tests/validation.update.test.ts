import { describe, expect, it } from "vitest";
import {
  adImageSchema,
  deleteAdSchema,
  getAdSchema,
  listAdsByProfileSchema,
  listAdsByUserSchema,
  updateAdSchema,
  updateAdStatusSchema,
} from "@tudomacae/ads/validation";
import { accept, omit, reject, validUpdateInput, validImage } from "./validationFixtures";

describe("adImageSchema", () => {
  it("accepts an image with only id, path and order", () => {
    expect(accept(adImageSchema, validImage)).toEqual(validImage);
  });

  it("accepts the optional title and description", () => {
    const described = {
      ...validImage,
      title: "Frente",
      description: "Vista frontal da bicicleta",
    };
    expect(accept(adImageSchema, described)).toEqual(described);
  });

  it("requires id, path and order", () => {
    for (const field of ["id", "path", "order"] as const) {
      expect(reject(adImageSchema, omit(validImage, field))).toEqual([
        { path: [field], code: "invalid_type" },
      ]);
    }
  });

  it("requires order to be a number, not a numeric string", () => {
    expect(reject(adImageSchema, { ...validImage, order: "0" })).toEqual([
      { path: ["order"], code: "invalid_type" },
    ]);
  });
});

describe("updateAdSchema", () => {
  it("accepts an update without status or images", () => {
    expect(accept(updateAdSchema, validUpdateInput)).toEqual(validUpdateInput);
  });

  it("accepts an update carrying a status and images", () => {
    const withExtras = {
      ...validUpdateInput,
      status: "paused",
      images: [validImage, { ...validImage, id: "image-2", order: 1 }],
    };
    expect(accept(updateAdSchema, withExtras)).toEqual(withExtras);
  });

  it("requires the ad id and the category ids to be non-empty", () => {
    for (const field of ["id", "categoryId", "subcategoryId"]) {
      expect(
        reject(updateAdSchema, { ...validUpdateInput, [field]: "" }),
      ).toEqual([{ path: [field], code: "too_small" }]);
    }
  });

  it("rejects an unknown status", () => {
    expect(
      reject(updateAdSchema, { ...validUpdateInput, status: "sold" }),
    ).toEqual([{ path: ["status"], code: "invalid_value" }]);
  });

  it("rejects a malformed image, pointing at its position", () => {
    expect(
      reject(updateAdSchema, {
        ...validUpdateInput,
        images: [validImage, { path: "ads/ad-1/image-2.jpg", order: 1 }],
      }),
    ).toEqual([{ path: ["images", 1, "id"], code: "invalid_type" }]);
  });

  it("carries the title length rule, reported against the title", () => {
    expect(
      reject(updateAdSchema, { ...validUpdateInput, title: "a".repeat(141) }),
    ).toEqual([{ path: ["title"], code: "too_big" }]);
  });
});

describe("updateAdStatusSchema", () => {
  it("accepts an id with a known status", () => {
    expect(accept(updateAdStatusSchema, { id: "ad-1", status: "paused" }))
      .toEqual({ id: "ad-1", status: "paused" });
  });

  it("requires a non-empty id", () => {
    expect(reject(updateAdStatusSchema, { id: "", status: "active" })).toEqual([
      { path: ["id"], code: "too_small" },
    ]);
  });

  it("requires a status, and only a known one", () => {
    expect(reject(updateAdStatusSchema, { id: "ad-1" })).toEqual([
      { path: ["status"], code: "invalid_value" },
    ]);
    expect(
      reject(updateAdStatusSchema, { id: "ad-1", status: "sold" }),
    ).toEqual([{ path: ["status"], code: "invalid_value" }]);
  });
});

describe.each([
  { name: "deleteAdSchema", schema: deleteAdSchema, field: "id" },
  { name: "getAdSchema", schema: getAdSchema, field: "id" },
  { name: "listAdsByUserSchema", schema: listAdsByUserSchema, field: "userId" },
  {
    name: "listAdsByProfileSchema",
    schema: listAdsByProfileSchema,
    field: "profileId",
  },
])("$name", ({ schema, field }) => {
  it(`accepts a non-empty ${field}`, () => {
    expect(accept(schema, { [field]: "identifier-1" })).toEqual({
      [field]: "identifier-1",
    });
  });

  it(`rejects an empty ${field}`, () => {
    expect(reject(schema, { [field]: "" })).toEqual([
      { path: [field], code: "too_small" },
    ]);
  });

  it(`rejects a missing ${field}`, () => {
    expect(reject(schema, {})).toEqual([
      { path: [field], code: "invalid_type" },
    ]);
  });
});
