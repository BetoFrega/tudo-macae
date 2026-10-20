import { describe, expect, test } from "vitest";
import {
  BusinessCatalogCursorError,
  createBusinessCatalog,
  normalizeBusinessName,
} from "../business";
import { fixture, foodArea, healthArea, profile } from "./businessCatalogFixtures";

describe("business catalog listing", () => {
  test("normalizes Brazilian names for prefix search", () => {
    expect(normalizeBusinessName("  Café   COM ÁRTE  ")).toBe("cafe com arte");
  });

  test("lists eligible businesses alphabetically using only public fields", async () => {
    const { userId: _claimableOwner, ...claimable } = profile("a", "Água Viva");
    const { userId: _orphanOwner, ...orphan } = profile("orphan", "Órfão");
    const { catalog } = fixture([
      profile("z", "Zênite"),
      {
        ...claimable,
        claimable: true,
        source: { url: "https://example.com/agua", checkedAt: 1 },
      },
      profile("blank", "   "),
      profile("contactless", "Sem contato", { contacts: [] }),
      profile("inactive", "Área inativa", {
        activityAreas: [{ categoryId: "food", subcategoryId: "inactive" }],
      }),
      orphan,
    ]);

    const page = await catalog.list({});

    expect(page.items.map(item => item.title)).toEqual(["Água Viva", "Zênite"]);
    expect(page.items[0]).toEqual({
      id: "a",
      title: "Água Viva",
      description: "Descrição de Água Viva",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [foodArea],
      isClaimable: true,
    });
    expect(page.items[0]).not.toHaveProperty("source");
    expect(page.items[0]).not.toHaveProperty("userId");
  });

  test("keeps name and exact activity browsing as distinct query modes", async () => {
    const { catalog, calls } = fixture([
      profile("cafe", "Café com Arte"),
      profile("clinic", "Clínica Central", { activityAreas: [healthArea] }),
    ]);

    await expect(catalog.list({ namePrefix: "  CAFE " })).resolves.toMatchObject({
      items: [{ id: "cafe" }],
    });
    await expect(catalog.list({ activityArea: healthArea })).resolves.toMatchObject({
      items: [{ id: "clinic" }],
    });
    await expect(catalog.list({ namePrefix: "caf", activityArea: foodArea }))
      .rejects.toThrow("Escolha busca por nome ou área de atuação");
    expect(calls).toContainEqual(expect.objectContaining({ normalizedNamePrefix: "cafe" }));
    expect(calls).toContainEqual(expect.objectContaining({ activityArea: healthArea }));
  });
  test("defaults to 20, caps at 50 and binds the opaque cursor to the query", async () => {
    const records = Array.from({ length: 55 }, (_, index) =>
      profile(`id-${String(index).padStart(2, "0")}`, `Negócio ${String(index).padStart(2, "0")}`));
    const { catalog, calls } = fixture(records);

    const first = await catalog.list({ namePrefix: "negocio", limit: 999 });
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(calls[0]).toEqual(expect.objectContaining({ limit: 50 }));

    const next = await catalog.list({ namePrefix: "negócio", cursor: first.nextCursor! });
    expect(next.items.map(item => item.id)).toEqual([
      "id-50", "id-51", "id-52", "id-53", "id-54",
    ]);
    await expect(catalog.list({ namePrefix: "outra", cursor: first.nextCursor! }))
      .rejects.toBeInstanceOf(BusinessCatalogCursorError);
  });

  test("fills a bounded page past ineligible candidates", async () => {
    const ineligible = Array.from({ length: 20 }, (_, index) =>
      profile(`ineligible-${index}`, `A ${index}`, { contacts: [] }));
    const eligible = Array.from({ length: 20 }, (_, index) =>
      profile(`eligible-${index}`, `B ${index}`));
    const { catalog, calls } = fixture([...ineligible, ...eligible]);

    const page = await catalog.list({ limit: 20 });

    expect(page.items).toHaveLength(20);
    expect(page.items.every(item => item.id.startsWith("eligible-"))).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("continues from the persisted ordering key during normalization migration", async () => {
    const calls: unknown[] = [];
    const firstProfile = profile("first", "Café Antigo");
    const catalog = createBusinessCatalog({
      activityAreas: { isActive: async () => true },
      store: {
        async getById() { return null; },
        async listCandidates(input) {
          calls.push(input);
          if (input.after) return { items: [] };
          return {
            items: [{
              profile: firstProfile,
              position: { normalizedTitle: "café antigo", id: firstProfile.id },
            }],
            next: { normalizedTitle: "café antigo", id: firstProfile.id },
          };
        },
      },
    });

    const first = await catalog.list({ limit: 1 });
    await catalog.list({ limit: 1, cursor: first.nextCursor! });

    expect(calls[1]).toEqual(expect.objectContaining({
      after: { normalizedTitle: "café antigo", id: firstProfile.id },
    }));
  });
});

test("complete business listing checks each area once across pages and refreshes on the next listing", async () => {
  let checks = 0;
  let active = true;
  const records = Array.from({ length: 105 }, (_, index) => profile(`profile-${index}`, `Business ${index}`));
  const { catalog } = fixture(records, async () => {
    checks += 1;
    return active;
  });
  const result = await catalog.listAll();
  expect(result).toHaveLength(105);
  expect(new Set(result.map(item => item.id)).size).toBe(105);
  expect(checks).toBe(1);
  active = false;
  expect(await catalog.listAll()).toEqual([]);
  expect(checks).toBe(2);
});
