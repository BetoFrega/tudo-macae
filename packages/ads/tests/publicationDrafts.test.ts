import { expect, test } from "vitest";
import { createPublicationDrafts, type PublicationRecord } from "../publicationDrafts";
import { input, setup, stored } from "./publicationDraftsFixtures";

test("an account saves and recovers work without creating a profile", async () => {
  const drafts = setup();
  expect(await drafts.save("owner", input)).toEqual({ ...input, title: "Bicicleta azul", userId: "owner", createdAt: 1000 });
  expect(await drafts.read("owner", "draft")).toEqual({ ...input, title: "Bicicleta azul", userId: "owner", createdAt: 1000, published: false, completed: false, images: [] });
  expect(await drafts.list("owner")).toEqual([await drafts.read("owner", "draft")]);
});

test("another account cannot read or overwrite a publication", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await expect(drafts.read("foreign", input.id)).rejects.toThrow("Publicação não encontrada nesta conta.");
  await expect(drafts.save("foreign", input)).rejects.toThrow("Publicação não encontrada nesta conta.");
  expect(await drafts.list("foreign")).toEqual([]);
  expect(await drafts.read("owner", "missing")).toBeNull();
});

test("a missing or foreign profile rejects the save without changing the previous work", async () => {
  const drafts = setup([], { foreign: "other", mine: "owner" });
  await drafts.save("owner", input);
  for (const advertiserProfileId of ["missing", "foreign"]) {
    await expect(drafts.save("owner", { ...input, title: "Título alterado", advertiserProfileId })).rejects.toThrow("Perfil não encontrado nesta conta.");
  }
  expect(await drafts.read("owner", input.id)).toMatchObject({ title: "Bicicleta azul", createdAt: 1000 });
  await drafts.save("owner", { ...input, advertiserProfileId: "mine" });
  expect(await drafts.read("owner", input.id)).toMatchObject({ advertiserProfileId: "mine" });
  await drafts.save("owner", input);
  expect(await drafts.read("owner", input.id)).not.toHaveProperty("advertiserProfileId");
});

test.each([
  { title: "Outro título" }, { text: "Outro texto revisado" },
  { categoryId: "other" }, { subcategoryId: "other" }, { advertiserProfileId: "other" },
])("publication rejects content changed in another tab: %j", async (change) => {
  const profiles = Object.fromEntries(["mine", "other"].map(id => [id, { userId: "owner", title: "Ana", contacts: [{ number: "22999999999" }] }]));
  const drafts = setup([{ ...stored, advertiserProfileId: "mine" }], profiles);
  const reviewed = { title: stored.title, text: stored.text, categoryId: stored.categoryId, subcategoryId: stored.subcategoryId, advertiserProfileId: "mine", images: [], advertiserProfile: { title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: false }] } };
  await drafts.save("owner", { ...input, title: stored.title, advertiserProfileId: "mine", ...change });
  await expect(drafts.publish("owner", input.id, reviewed)).rejects.toThrow("Este rascunho foi alterado em outra aba");
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: false, ...change });
});

test.each(["publishing", "published"])("saving a %s publication preserves its existing content", async (publicationState) => {
  const drafts = setup([{ ...stored, publicationState }]);
  const before = await drafts.read("owner", input.id);
  expect(await drafts.save("owner", { ...input, title: "Outro título", advertiserProfileId: "missing" })).toEqual(before);
  expect(await drafts.read("owner", input.id)).toEqual(before);
});

test("listing uses publication intent rather than visibility and omits legacy ads", async () => {
  const { publicationState: _state, ...legacy } = stored;
  const drafts = setup([
    { ...stored, id: "pending" },
    { ...stored, id: "publishing", publicationState: "publishing", status: "active" },
    { ...stored, id: "done", publicationState: "published" },
    { ...legacy, id: "legacy" },
  ]);
  expect((await drafts.list("owner")).map(record => record.id)).toEqual(["pending", "publishing"]);
  await expect(drafts.read("owner", "legacy")).rejects.toThrow("Este anúncio não tem uma publicação pendente.");
  await expect(drafts.save("owner", { ...input, id: "legacy" })).rejects.toThrow("Este anúncio não tem uma publicação pendente.");
});

test("updating pending work preserves its creation date", async () => {
  const drafts = setup([stored]);
  await drafts.save("owner", { ...input, title: "Bicicleta verde" });
  expect(await drafts.read("owner", input.id)).toMatchObject({ title: "Bicicleta verde", createdAt: 50 });
});

test("invalid identifiers and content cannot create work", async () => {
  const drafts = setup();
  await expect(drafts.save("owner", { ...input, id: "invalid/id" })).rejects.toThrow();
  await expect(drafts.save("", input)).rejects.toThrow();
  await expect(drafts.save("owner", { ...input, text: "short" })).rejects.toThrow();
  expect(await drafts.list("owner")).toEqual([]);
});

test("the save effect retains existing images and writes the normalized slug", async () => {
  const images = [{ id: "image", path: "ad-images/existing.webp", order: 0 }];
  const committed: PublicationRecord[] = [];
  const drafts = createPublicationDrafts({
    now: () => 1000,
    store: {
      async read() { return { ...stored, images }; },
      async list() { return []; },
      async transact(_id, decide) {
        return decide({
          async read() { return { ...stored, images }; },
          async readProfile() { return null; },
          saveProfile() { throw new Error("Unexpected profile write"); },
          updatePublication() { throw new Error("Unexpected publication update"); },
          deletePublication() { throw new Error("Unexpected publication deletion"); },
          save(record) { committed.push(record); },
        });
      },
    },
  });
  await drafts.save("owner", { ...input, title: "Bicicleta recém-pintada" });
  expect(committed).toEqual([{ ...stored, title: "Bicicleta recém-pintada", slug: "bicicleta-recem-pintada", images }]);
});
