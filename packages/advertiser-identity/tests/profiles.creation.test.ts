import { describe, expect, test } from "vitest";
import { profileFixture } from "./profileFixtures";

describe("advertiser profile creation", () => {
  test("records each created identity once with its actor, and neither a replay nor a rejected creation", async () => {
    const { profiles, identitiesCreated } = profileFixture();
    const input = {
      userId: "owner",
      operationId: crypto.randomUUID(),
      title: "Oficina do Bairro",
      description: "",
      contacts: [],
      activityAreas: [],
      identityType: "business" as const,
    };
    const id = await profiles.create(input);
    await profiles.create(input);
    await expect(profiles.create({ ...input, title: "Outra oficina" })).rejects.toThrow();
    expect(identitiesCreated).toEqual([{ actorId: "owner", identityId: id, identityType: "business" }]);
  });

  test("replays a creation by operation ID and rejects changed fields", async () => {
    const { profiles, setTime } = profileFixture();
    const input = {
      userId: "owner",
      operationId: crypto.randomUUID(),
      title: "Oficina do Bairro",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [],
    };
    const first = await profiles.create(input);
    setTime(2000);
    expect(await profiles.create(input)).toBe(first);
    await expect(profiles.create({ ...input, title: "Outra oficina" })).rejects.toMatchObject({
      name: "AdvertiserProfileCreationPayloadConflict",
      profileId: first,
    });
    expect((await profiles.listForUser("owner")).map(profile => profile.id)).toEqual([first]);
  });

  test("rejects replay after the owner deletes the committed profile", async () => {
    const { profiles } = profileFixture();
    const input = {
      userId: "owner",
      operationId: crypto.randomUUID(),
      title: "Oficina do Bairro",
      description: "",
      contacts: [],
      activityAreas: [],
    };
    const id = await profiles.create(input);
    await profiles.delete({ id });
    await expect(profiles.create(input)).rejects.toMatchObject({
      name: "AdvertiserProfileCreationPayloadConflict",
      profileId: id,
    });
    expect(await profiles.read({ id })).toBeNull();
  });

  test("finds possible duplicates by normalized name or exact normalized contact", async () => {
    const { profiles } = profileFixture();
    const nameMatch = await profiles.create({
      userId: "owner-1",
      title: "  Padaria Macaense ",
      description: "",
      contacts: [{ number: "22911111111", isWhatsapp: false }],
    });
    const contactMatch = await profiles.create({
      userId: "owner-2",
      title: "Outro negócio",
      description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
    });
    await profiles.create({
      userId: "owner-3",
      title: "Sem relação",
      description: "",
      contacts: [{ number: "22988888888", isWhatsapp: false }],
    });

    const candidates = await profiles.findDuplicateCandidates({
      title: "padaria macaense",
      contacts: [{ number: "(22) 99999-9999", isWhatsapp: false }],
    });

    expect(candidates.map(profile => profile.id)).toEqual([nameMatch, contactMatch]);
  });
});
