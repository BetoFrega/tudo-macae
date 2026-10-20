import { describe, expect, test } from "vitest";
import { profileFixture } from "./profileFixtures";

describe("advertiser profile lifecycle", () => {
  test("reports skipped image cleanup paths once after profile deletion", async () => {
    const { profiles, setAssociatedAds, cleanupSkipped } = profileFixture();
    const id = await profiles.create({ userId: "owner", title: "Oficina", description: "", contacts: [] });
    setAssociatedAds(id, [{ id: "ad-1", images: [{ path: "ad-images/another/photo.webp" }] }]);
    await profiles.delete({ id });
    expect(cleanupSkipped).toEqual([{ correlationId: "profile-delete-test", count: 1 }]);
  });

  test("creates, reads, updates, lists and deletes through the public interface", async () => {
    const { profiles, setTime } = profileFixture();
    expect(await profiles.listForUser("owner")).toEqual([]);
    const id = await profiles.create({
      userId: "owner",
      title: "Perfil",
      description: "",
      contacts: [],
    });
    expect(await profiles.read({ id })).toEqual({
      id,
      userId: "owner",
      revision: 1,
      title: "Perfil",
      description: "",
      contacts: [],
      activityAreas: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
    setTime(2000);
    await profiles.update({
      id,
      title: "Novo título",
      description: "Apresentação",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [],
    });
    expect(await profiles.read({ id })).toMatchObject({
      title: "Novo título",
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(await profiles.listForUser("another")).toEqual([]);
    expect(await profiles.listForUser("owner")).toEqual([
      await profiles.read({ id }),
    ]);
    expect(await profiles.listAll()).toEqual([await profiles.read({ id })]);
    expect(await profiles.readPublic({ id })).toEqual({
      id,
      title: "Novo título",
      description: "Apresentação",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [],
    });
    await profiles.delete({ id });
    expect(await profiles.read({ id })).toBeNull();
    expect(await profiles.readPublic({ id })).toBeNull();
  });
  test("ownership accepts only the owner and rejects absent profiles", async () => {
    const { profiles } = profileFixture();
    const id = await profiles.create({
      userId: "owner",
      title: "Perfil",
      description: "",
      contacts: [],
    });
    expect(await profiles.verifyOwnership({ id, userId: "owner" })).toEqual(
      await profiles.read({ id }),
    );
    await expect(
      profiles.verifyOwnership({ id, userId: "other" }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      profiles.verifyOwnership({ id: "absent", userId: "owner" }),
    ).rejects.toThrow("Profile not found");
  });
  test("invalid edits leave the saved record unchanged", async () => {
    const { profiles } = profileFixture();
    const id = await profiles.create({
      userId: "owner",
      title: "Perfil",
      description: "",
      contacts: [],
    });
    const before = await profiles.read({ id });
    await expect(
      profiles.update({ id, title: "", description: "", contacts: [] }),
    ).rejects.toThrow();
    expect(await profiles.read({ id })).toEqual(before);
    await expect(profiles.read({ id: "" })).rejects.toThrow();
  });
  test("photo replacement preserves contacts and creation time", async () => {
    const { profiles, setTime } = profileFixture();
    const id = await profiles.create({
      userId: "owner",
      title: "Perfil",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: false }],
    });
    setTime(3000);
    await profiles.replacePhoto({ id, photoPath: "photo.webp", expectedRevision: 1 });
    expect(await profiles.read({ id })).toMatchObject({
      photoPath: "photo.webp",
      contacts: [{ number: "22999999999", isWhatsapp: false }],
      createdAt: 1000,
      updatedAt: 3000,
    });
  });
});
