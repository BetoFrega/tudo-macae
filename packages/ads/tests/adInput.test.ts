import { expect, test } from "vitest";
import {
  createAdInput,
  pendingPublicationInput,
  updateAdInput,
} from "../validation";

const inputs = [
  {
    name: "creation",
    schema: createAdInput,
    input: (text: string) => ({
      categoryId: "vehicles",
      subcategoryId: "cars",
      advertiserProfileId: "profile-1",
      title: "Carro revisado",
      text,
    }),
  },
  {
    name: "update",
    schema: updateAdInput,
    input: (text: string) => ({
      id: "ad-1",
      categoryId: "vehicles",
      subcategoryId: "cars",
      title: "Carro revisado",
      text,
    }),
  },
  {
    name: "publication",
    schema: pendingPublicationInput,
    input: (text: string) => ({
      id: "publication-1",
      categoryId: "vehicles",
      subcategoryId: "cars",
      title: "Carro revisado",
      text,
    }),
  },
];

test.each(inputs)("$name accepts the canonical ad text boundaries", ({ schema, input }) => {
  for (const length of [9, 10, 1000]) {
    expect(schema.safeParse(input("a".repeat(length)))).toMatchObject({
      success: length >= 10,
    });
  }

  const result = schema.safeParse(input("a".repeat(1001)));
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues).toMatchObject([
      { path: ["text"], code: "too_big", message: "O anúncio deve ter no máximo 1000 caracteres" },
    ]);
  }
});
