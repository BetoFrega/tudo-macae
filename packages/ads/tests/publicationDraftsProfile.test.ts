import { expect, test } from "vitest";
import { createPublicationDrafts } from "../publicationDrafts";
import { input, setup, stored } from "./publicationDraftsFixtures";

test("saving a profile explicitly associates it without publishing the pending ad", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  const profileInput = { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };
  expect(await drafts.saveProfile("owner", profileInput)).toBe("publication-draft");
  expect(await drafts.saveProfile("owner", profileInput)).toBe("publication-draft");
  expect(await drafts.read("owner", input.id)).toMatchObject({ advertiserProfileId: "publication-draft", published: false, completed: false });
});

test("profile saving rejects foreign ownership, missing explicit profiles and unknown publications", async () => {
  const drafts = setup([], { foreign: "another", mine: "owner" });
  await drafts.save("owner", input);
  const profileInput = { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };
  for (const profileId of ["foreign", "absent"]) {
    await expect(drafts.saveProfile("owner", { ...profileInput, profileId })).rejects.toThrow("Perfil não encontrado nesta conta.");
  }
  await expect(drafts.saveProfile("another", profileInput)).rejects.toThrow("Publicação não encontrada nesta conta.");
  await expect(drafts.saveProfile("owner", { ...profileInput, publicationId: "absent" })).rejects.toThrow("Publicação não encontrada nesta conta.");
  expect(await drafts.read("owner", input.id)).not.toHaveProperty("advertiserProfileId");
  expect(await drafts.saveProfile("owner", { ...profileInput, profileId: "mine" })).toBe("mine");
  expect(await drafts.saveProfile("owner", profileInput)).toBe("mine");
});

test.each(["publishing", "published"])("profile saving cannot edit a %s publication", async (publicationState) => {
  const drafts = setup([{ ...stored, publicationState }]);
  await expect(drafts.saveProfile("owner", { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] })).rejects.toThrow("Este anúncio já foi publicado.");
});

test("invalid profile input cannot associate a profile", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await expect(drafts.saveProfile("owner", { publicationId: input.id, title: "", contacts: [] })).rejects.toThrow();
  expect(await drafts.read("owner", input.id)).not.toHaveProperty("advertiserProfileId");
});

test.each([
  { existing: null, revision: 1 },
  { existing: { userId: "owner" }, revision: 2 },
  { existing: { userId: "owner", revision: 1 }, revision: 2 },
  { existing: { userId: "owner", revision: 7 }, revision: 8 },
])("profile write preserves metadata and advances to revision $revision from $existing", async ({ existing, revision }) => {
  const writes: unknown[] = [];
  const drafts = createPublicationDrafts({
    now: () => 1200,
    store: {
      async read() { return stored; },
      async list() { return [stored]; },
      async transact(_id, decide) {
        return decide({
          async read() { return stored; },
          async readProfile() { return existing; },
          save() { throw new Error("Unexpected publication overwrite"); },
          updatePublication() { throw new Error("Unexpected publication update"); },
          deletePublication() { throw new Error("Unexpected publication deletion"); },
          saveProfile(profileId, profile) { writes.push({ profileId, profile }); },
        });
      },
    },
  });
  await drafts.saveProfile("owner", { publicationId: input.id, title: " Ana ", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  const profile = { userId: "owner", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }], updatedAt: 1200, revision };
  expect(writes).toEqual([{ profileId: "publication-draft", profile: existing ? profile : { ...profile, createdAt: 1200, description: "" } }]);
});

test("a retried profile save derives its revision from the fresh transaction snapshot", async () => {
  const revisions: number[] = [];
  const drafts = createPublicationDrafts({
    now: () => 1200,
    store: {
      async read() { return stored; },
      async list() { return [stored]; },
      async transact(_id, decide) {
        let revision = 7;
        const attempt = () => decide({
          async read() { return stored; },
          async readProfile() { return { userId: "owner", revision }; },
          saveProfile(_profileId, profile) { revisions.push(profile.revision); },
          save() { throw new Error("Unexpected publication overwrite"); },
          updatePublication() { throw new Error("Unexpected publication update"); },
          deletePublication() { throw new Error("Unexpected publication deletion"); },
        });
        await attempt();
        revision = 8;
        return attempt();
      },
    },
  });
  await drafts.saveProfile("owner", { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  expect(revisions).toEqual([8, 9]);
});

test("claimable profiles are refused without changing every publication entrypoint", async () => {
  const claimable = { claimable: true, title: "Loja", contacts: [{ number: "22999999999" }] };

  const saving = setup([], { claimable });
  await saving.save("owner", input);
  const beforeSave = await saving.read("owner", input.id);
  await expect(saving.save("owner", { ...input, advertiserProfileId: "claimable" }))
    .rejects.toThrow("Perfil não encontrado nesta conta.");
  await expect(saving.saveProfile("owner", {
    publicationId: input.id,
    profileId: "claimable",
    title: "Loja",
    contacts: [{ number: "22999999999", isWhatsapp: false }],
  })).rejects.toThrow("Perfil não encontrado nesta conta.");
  expect(await saving.read("owner", input.id)).toEqual(beforeSave);

  const pending = setup([{ ...stored, advertiserProfileId: "claimable" }], { claimable });
  const beforePublish = await pending.read("owner", input.id);
  await expect(pending.publish("owner", input.id)).rejects.toThrow("Complete o nome e um contato");
  expect(await pending.read("owner", input.id)).toEqual(beforePublish);

  const publishing = setup([{
    ...stored,
    advertiserProfileId: "claimable",
    publicationState: "publishing",
    status: "active",
  }], { claimable });
  const beforeComplete = await publishing.read("owner", input.id);
  await expect(publishing.complete("owner", input.id)).rejects.toThrow("Perfil não encontrado nesta conta.");
  expect(await publishing.read("owner", input.id)).toEqual(beforeComplete);
});

test("publication profile creation records the chosen type once and keeps one personal profile per account", async () => {
  const drafts = setup([{ ...stored, id: "second" }], { personal: { userId: "owner", identityType: "personal" } as never });
  await drafts.save("owner", input);
  const profileInput = { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };

  await expect(drafts.saveProfile("owner", { ...profileInput, identityType: "personal" })).rejects.toThrow("Sua conta já tem um perfil pessoal.");
  expect(await drafts.saveProfile("owner", { ...profileInput, identityType: "business" })).toBe("publication-draft");
  expect(drafts.profile("publication-draft")).toMatchObject({ identityType: "business" });
  await drafts.saveProfile("owner", { ...profileInput, title: "Ana editada", identityType: "personal" });
  expect(drafts.profile("publication-draft")).toMatchObject({ title: "Ana editada", identityType: "business" });
});

test("publication profile creation refuses a type where the store cannot guarantee it", async () => {
  const drafts = setup([], {}, { identityTypes: false });
  await drafts.save("owner", input);
  const profileInput = { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };

  await expect(drafts.saveProfile("owner", { ...profileInput, identityType: "business" })).rejects.toThrow("Tipo de identidade indisponível");
  expect(await drafts.saveProfile("owner", profileInput)).toBe("publication-draft");
  expect(drafts.profile("publication-draft")).not.toHaveProperty("identityType");
});
