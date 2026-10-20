import { expect, test } from "vitest";
import { input, setup, stored } from "./publicationDraftsFixtures";

test("publication rejects a selected profile changed after its review", async () => {
  const drafts = setup([{ ...stored, advertiserProfileId: "mine" }], {
    mine: { userId: "owner", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] },
  });
  const reviewed = {
    title: stored.title, text: stored.text, categoryId: stored.categoryId, subcategoryId: stored.subcategoryId,
    advertiserProfileId: "mine", images: [],
    advertiserProfile: { title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] },
  };
  await drafts.saveProfile("owner", { publicationId: input.id, profileId: "mine", title: "Outro nome", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  await expect(drafts.publish("owner", input.id, reviewed)).rejects.toThrow("Confira os dados atualizados de quem anuncia");
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: false, completed: false });
});

test("activation rejects a selected profile changed during photo verification", async () => {
  const profile = { userId: "owner", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };
  const drafts = setup([{ ...stored, advertiserProfileId: "mine" }], { mine: profile });
  const reviewed = {
    title: stored.title, text: stored.text, categoryId: stored.categoryId, subcategoryId: stored.subcategoryId,
    advertiserProfileId: "mine", images: [],
    advertiserProfile: { title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] },
  };
  await drafts.publish("owner", input.id, reviewed);
  profile.contacts = [{ number: "22988888888", isWhatsapp: false }];
  await expect(drafts.complete("owner", input.id, reviewed)).rejects.toThrow("Confira os dados atualizados de quem anuncia");
  expect(await drafts.read("owner", input.id)).toMatchObject({ completed: false });
});

test("publishing is repeatable and completion removes work from pending listings", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await drafts.saveProfile("owner", { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  const result = await drafts.publish("owner", input.id);
  expect(result).toEqual({ adId: "draft", slug: "bicicleta-azul", categoryId: "bikes", subcategoryId: "used", advertiserProfileId: "publication-draft" });
  expect(await drafts.publish("owner", input.id)).toEqual(result);
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: true, completed: false });
  expect(await drafts.list("owner")).toHaveLength(1);
  await drafts.complete("owner", input.id);
  expect(await drafts.list("owner")).toEqual([]);
});

test("a failed image check restores a publication for photo repair without reopening a completed ad", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await drafts.saveProfile("owner", { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  await drafts.publish("owner", input.id);
  await expect(drafts.returnToPending("foreign", input.id)).rejects.toThrow("Publicação não encontrada");
  await drafts.returnToPending("owner", input.id);
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: false, completed: false });
  await drafts.publish("owner", input.id);
  await drafts.complete("owner", input.id);
  await drafts.returnToPending("owner", input.id);
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: true, completed: true });
});

test("does not activate a publication if its profile loses the last contact during photo verification", async () => {
  const profile = { userId: "owner", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };
  const drafts = setup([], { profile });
  await drafts.save("owner", { ...input, advertiserProfileId: "profile" });
  await drafts.publish("owner", input.id);
  profile.contacts = [];
  await expect(drafts.complete("owner", input.id)).rejects.toThrow("Complete o nome e um contato");
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: true, completed: false });
});

test("publication waits until removed pending photos are cleaned up", async () => {
  const drafts = setup([{
    ...stored,
    advertiserProfileId: "profile",
    pendingImageCleanupPaths: ["ad-images/draft/pending/removed.png"],
  }], { profile: { userId: "owner", title: "Ana", contacts: [{ number: "22999999999" }] } });
  await expect(drafts.publish("owner", input.id)).rejects.toThrow("limpeza das fotos");
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: false });
});

test("publication requires a complete profile belonging to the account", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await expect(drafts.publish("owner", input.id)).rejects.toThrow("Complete o perfil antes de publicar.");
  for (const userId of ["owner", "foreign"]) {
    const invalidProfile = setup([{ ...stored, advertiserProfileId: "profile" }], { profile: userId });
    await expect(invalidProfile.publish("owner", input.id)).rejects.toThrow("Complete o nome e um contato do perfil antes de publicar.");
  }
  await expect(drafts.publish("foreign", input.id)).rejects.toThrow("Publicação não encontrada nesta conta.");
});

test("publishing one ad does not publish another ad sharing its profile", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  const profileId = await drafts.saveProfile("owner", { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  await drafts.save("owner", { ...input, id: "other", advertiserProfileId: profileId });
  await drafts.publish("owner", input.id);
  expect(await drafts.read("owner", "other")).toMatchObject({ published: false, completed: false });
});

test("repeating a completed publication cannot reactivate a paused ad", async () => {
  const drafts = setup([{ ...stored, publicationState: "published", status: "paused", advertiserProfileId: "profile" }]);
  await expect(drafts.publish("owner", input.id)).rejects.toThrow("Este anúncio foi pausado. Use Meus anúncios para reativá-lo.");
  await drafts.complete("owner", input.id);
  await expect(drafts.publish("owner", input.id)).rejects.toThrow("Este anúncio foi pausado. Use Meus anúncios para reativá-lo.");
});
