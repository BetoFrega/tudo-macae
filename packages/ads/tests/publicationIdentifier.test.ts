import { expect, test } from "vitest";
import { pendingPublicationInput, publicationIdentifier } from "../validation";

test("rejects URL dot segments while accepting ordinary publication IDs", () => {
  expect(publicationIdentifier.safeParse(".").success).toBe(false);
  expect(publicationIdentifier.safeParse("..").success).toBe(false);
  expect(publicationIdentifier.safeParse("draft-1").success).toBe(true);
  expect(publicationIdentifier.safeParse("negócio 1").success).toBe(true);
});

test("an existing pending publication with a legacy ID remains editable", () => {
  expect(pendingPublicationInput.safeParse({
    id: "negócio 1", title: "Bicicleta", text: "Bicicleta usada",
    categoryId: "bikes", subcategoryId: "used",
  }).success).toBe(true);
});
