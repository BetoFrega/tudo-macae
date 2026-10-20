import { describe, expect, test } from "vitest";
import {
  createAdvertiserProfileAdministration,
  matchAdvertiserProfileDuplicate,
  type AdvertiserProfileAdministrationStore,
} from "../administration";

function claimableProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile",
    claimable: true as const,
    source: { url: "https://example.com/profile", checkedAt: 1 },
    title: "Perfil",
    description: "",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }],
    revision: 2,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function fixture(options: {
  create?: Parameters<AdvertiserProfileAdministrationStore["create"]>[1] extends (facts: infer Facts) => unknown ? Facts : never;
  update?: Parameters<AdvertiserProfileAdministrationStore["update"]>[1] extends (facts: infer Facts) => unknown ? Facts : never;
  delete?: Parameters<AdvertiserProfileAdministrationStore["delete"]>[1] extends (facts: infer Facts) => unknown ? Facts : never;
} = {}) {
  const store: AdvertiserProfileAdministrationStore = {
    async list() { return { items: [] }; },
    async get() { return { status: "notFound" }; },
    async findDuplicates() { return { items: [] }; },
    async create(_input, decide) {
      const plan = decide(options.create!);
      return "status" in plan ? plan : plan.result;
    },
    async update(_input, decide) {
      const plan = decide(options.update!);
      return "status" in plan ? plan : plan.result;
    },
    async delete(_input, decide) {
      const plan = decide(options.delete!);
      return "status" in plan ? plan : plan.result;
    },
  };
  return {
    administration: createAdvertiserProfileAdministration({
      store,
      now: () => 10,
      digestConfirmationEvidence: evidence => `digest:${evidence}`,
    }),
  };
}

describe("advertiser profile administration", () => {
  test.each([undefined, 11, 10, 9])("claimable deletion blocks only active or undated photo reservations (%s)", async (expiresAt) => {
    const { administration } = fixture({ delete: { profile: claimableProfile(), hasAssociatedAds: false, photoCleanupOperationId: "cleanup", photoReservations: [{ expiresAt }] } });
    const result = administration.delete({ id: "profile", expectedRevision: 2, idempotencyKey: "delete", actorId: "admin" });
    if (expiresAt === undefined || expiresAt > 10) await expect(result).rejects.toMatchObject({ code: "imageCleanupBlocked" });
    else await expect(result).resolves.toMatchObject({ outcome: "deleted" });
  });
  test("source verification time stays fixed when persistence repeats a creation decision", async () => {
    let clock = 100;
    const inputs = { title: "Perfil", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }], sourceUrl: "https://example.com/profile", idempotencyKey: "retry", actorId: "admin" };
    const store: AdvertiserProfileAdministrationStore = {
      list: async () => ({ items: [] }), get: async () => ({ status: "notFound" }), findDuplicates: async () => ({ items: [] }),
      async create(_input, decide) {
        const facts = { profileId: "created", duplicates: [], activityAreas: [true] };
        const first = decide(facts);
        clock = 200;
        const retry = decide(facts);
        expect(retry).toEqual(first);
        if ("status" in retry) return retry;
        expect(retry.record.source?.checkedAt).toBe(100);
        return retry.result;
      },
      update: async () => { throw new Error("Unused update"); },
      delete: async () => { throw new Error("Unused delete"); },
    };
    const administration = createAdvertiserProfileAdministration({ store, now: () => clock, digestConfirmationEvidence: value => value });
    await expect(administration.create(inputs)).resolves.toMatchObject({ outcome: "created" });
  });
  test("matches duplicate names without depending on Portuguese diacritics", () => {
    expect(matchAdvertiserProfileDuplicate(
      claimableProfile({ title: "Café Central" }),
      "cafe central",
      new Set(),
    )).toMatchObject({ matchReasons: ["normalizedName"] });
  });

  test.each(["contacts", "activityAreas"] as const)(
    "enforces the claimable %s minimum on create and update",
    async (field) => {
      const { administration } = fixture();
      const createInput = {
        title: "Perfil",
        description: "",
        contacts: [{ number: "22999999999", isWhatsapp: true }],
        activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }],
        sourceUrl: "https://example.com/profile",
        idempotencyKey: "create",
        actorId: "admin",
      };
      await expect(administration.create({ ...createInput, [field]: [] })).rejects.toThrow();
      await expect(administration.update({
        id: "profile",
        expectedRevision: 2,
        patch: { [field]: [] },
        idempotencyKey: "update",
        actorId: "admin",
      })).rejects.toThrow();
    },
  );

  test("requires a confirmation token only for the current duplicate evidence", async () => {
    const duplicates = [{ id: "duplicate", state: "claimable" as const, title: "Perfil", matchReasons: ["normalizedName" as const] }];
    const { administration } = fixture({
      create: { profileId: "created", duplicates, activityAreas: [true] },
    });
    const input = {
      title: "Perfil", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }], sourceUrl: "https://example.com/profile",
      idempotencyKey: "create", actorId: "admin",
    };

    const firstAttempt = administration.create(input);
    await expect(firstAttempt).rejects.toMatchObject({
      code: "possibleDuplicate", details: { candidates: duplicates, confirmationToken: expect.any(String) },
    });
    const confirmationToken = await firstAttempt.catch(error => error.details.confirmationToken as string);
    await expect(administration.create({ ...input, duplicateConfirmationToken: "stale" })).rejects.toMatchObject({
      code: "duplicateConfirmationChanged", details: { candidates: duplicates, confirmationToken },
    });
    await expect(administration.create({ ...input, duplicateConfirmationToken: confirmationToken }))
      .resolves.toMatchObject({ outcome: "created" });
  });

  test("refuses inactive activity areas before producing a creation plan", async () => {
    const { administration } = fixture({
      create: { profileId: "created", duplicates: [], activityAreas: [false] },
    });

    await expect(administration.create({
      title: "Perfil", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "category", subcategoryId: "inactive" }], sourceUrl: "https://example.com/profile",
      idempotencyKey: "create", actorId: "admin",
    })).rejects.toThrow("Categoria ou subcategoria inválida ou inativa");
  });

  test("rejects incoherent state and stale revisions through the public update operation", async () => {
    const input = { id: "profile", expectedRevision: 2, patch: { description: "Nova" }, idempotencyKey: "update", actorId: "admin" };
    await expect(fixture({ update: { profile: claimableProfile({ claimable: undefined, userId: undefined }), activityAreas: [] } }).administration.update(input))
      .rejects.toMatchObject({ code: "invalidProfileState" });
    await expect(fixture({ update: { profile: claimableProfile({ revision: 3 }), activityAreas: [] } }).administration.update(input))
      .rejects.toMatchObject({ code: "revisionConflict", details: { currentRevision: 3 } });
  });

  test("returns unchanged state, revision and cache effects from the public update operation", async () => {
    const { administration } = fixture({
      update: { profile: claimableProfile(), activityAreas: [true] },
    });

    await expect(administration.update({
      id: "profile", expectedRevision: 2,
      patch: { contacts: [{ number: "22999999999", isWhatsapp: true }] },
      idempotencyKey: "update", actorId: "admin",
    })).resolves.toMatchObject({
      outcome: "unchanged", replayed: false, revision: 2,
      effects: {
        previousActivityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }],
        activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }],
      },
    });
  });
});
