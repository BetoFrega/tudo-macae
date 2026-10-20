import { describe, expect, test } from "vitest";
import { profileFixture } from "./profileFixtures";

describe("claimable advertiser profiles", () => {
  test("creates a public claimable profile without assigning the administrator as owner", async () => {
    const { profiles } = profileFixture();
    const id = await profiles.createClaimable({
      title: "Padaria Macaense",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      sourceUrl: "https://example.com/padaria-macaense",
    });

    expect(await profiles.read({ id })).toEqual({
      id,
      claimable: true,
      source: {
        url: "https://example.com/padaria-macaense",
        checkedAt: 1000,
      },
      title: "Padaria Macaense",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      revision: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await profiles.listForUser("admin")).toEqual([]);
    expect(await profiles.readPublic({ id })).toEqual({
      id,
      title: "Padaria Macaense",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      isClaimable: true,
    });
  });

  test("does not publish an ownerless record without coherent claimable evidence", async () => {
    const { profiles, seedRecord } = profileFixture();
    seedRecord({
      id: "orphan",
      title: "Registro órfão",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: false }],
      activityAreas: [],
      revision: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });

    expect(await profiles.readPublic({ id: "orphan" })).toBeNull();

    seedRecord({
      id: "malformed-claimable",
      claimable: true,
      source: { url: "not-a-url", checkedAt: 1000 },
      title: "Registro inválido",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: false }],
      activityAreas: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await profiles.readPublic({ id: "malformed-claimable" })).toBeNull();

    seedRecord({
      id: "impossible",
      userId: "owner",
      claimable: true,
      source: { url: "https://example.com/impossible", checkedAt: 1000 },
      title: "Combinação impossível",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: false }],
      activityAreas: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await profiles.readPublic({ id: "impossible" })).toBeNull();
    expect(await profiles.listForUser("owner")).toEqual([]);
    await expect(profiles.verifyOwnership({ id: "impossible", userId: "owner" }))
      .rejects.toThrow("Profile not found");
  });

  test("updates only claimable profiles and refreshes source time on the server", async () => {
    const { profiles, setTime } = profileFixture();
    const claimableId = await profiles.createClaimable({
      title: "Padaria Macaense",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      sourceUrl: "https://example.com/original",
    });
    const ownedId = await profiles.create({
      userId: "owner",
      title: "Perfil próprio",
      description: "",
      contacts: [],
    });

    setTime(2000);
    await profiles.updateClaimable({
      id: claimableId,
      title: "Padaria atualizada",
      description: "Novo texto",
      contacts: [{ number: "22988888888", isWhatsapp: false }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      sourceUrl: "https://example.com/atualizada",
    });

    expect(await profiles.read({ id: claimableId })).toMatchObject({
      title: "Padaria atualizada",
      source: { url: "https://example.com/atualizada", checkedAt: 2000 },
      updatedAt: 2000,
    });
    await expect(profiles.updateClaimable({
      id: ownedId,
      title: "Tentativa",
      description: "",
      contacts: [{ number: "22988888888", isWhatsapp: false }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      sourceUrl: "https://example.com/tentativa",
    })).rejects.toThrow("não é reivindicável");
  });

  test("deletes only coherent claimable profiles without associated ads", async () => {
    const { profiles, seedRecord, setHasAds } = profileFixture();
    const deletableId = await profiles.createClaimable({
      title: "Perfil removível",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: false }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      sourceUrl: "https://example.com/removivel",
    });
    const associatedId = await profiles.createClaimable({
      title: "Perfil associado",
      description: "",
      contacts: [{ number: "22988888888", isWhatsapp: false }],
      activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
      sourceUrl: "https://example.com/associado",
    });
    setHasAds(associatedId);
    const ownedId = await profiles.create({
      userId: "owner",
      title: "Perfil próprio",
      description: "",
      contacts: [],
    });
    seedRecord({
      id: "orphan",
      title: "Registro órfão",
      description: "",
      contacts: [],
      activityAreas: [],
      revision: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });

    await profiles.deleteClaimable({ id: deletableId });
    expect(await profiles.read({ id: deletableId })).toBeNull();
    await expect(profiles.deleteClaimable({ id: associatedId })).rejects.toThrow("anúncios associados");
    await expect(profiles.deleteClaimable({ id: ownedId })).rejects.toThrow("não é reivindicável");
    await expect(profiles.deleteClaimable({ id: "orphan" })).rejects.toThrow("não é reivindicável");
    expect(await profiles.read({ id: associatedId })).not.toBeNull();
    expect(await profiles.read({ id: ownedId })).not.toBeNull();
    expect(await profiles.read({ id: "orphan" })).not.toBeNull();
  });
});
