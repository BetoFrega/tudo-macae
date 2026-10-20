import { expect, test } from "vitest";
import { z } from "zod";
import { call, capability, category, ownerActor, profile } from "./classifiedsRuntimeHarness";

const subcategory = (id: string, categoryId: string, isActive = true) => ({ kind: "subcategory", id, namespace: categoryId, body: { name: id, slug: id, order: 1, isActive, categoryId } });
const business = (id: string, title: string, extra: object = {}) => {
  const base = profile(id);
  return { ...base, body: { ...base.body, title, ...extra } };
};
const page = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string().optional() });
const ids = z.array(z.object({ id: z.string() })).transform(items => items.map(item => item.id));
const anonymous = { actor: undefined };

async function seed(...records: object[]) {
  const result = await call({ action: "importRecords", records });
  expect(result.error, result.message).toBeUndefined();
}

async function catalogTaxonomy() {
  await seed(
    category("category"), subcategory("subcategory", "category"),
    category("other"), subcategory("retired", "other", false),
  );
}

test("business catalog lists eligible D1 profiles by normalized title, filters and pages without a session", async () => {
  await catalogTaxonomy();
  await seed(
    business("b", "Bravo"), business("a", "álamo"), business("c", "Charlie"),
    business("no-contact", "Delta", { contacts: [] }),
    business("retired-area", "Eco", { activityAreas: [{ categoryId: "other", subcategoryId: "retired" }] }),
  );

  const first = page.parse((await capability("business.list", { limit: 2 }, anonymous)).value);
  expect(first.items.map(item => item.id)).toEqual(["a", "b"]);
  const second = page.parse((await capability("business.list", { limit: 2, cursor: first.nextCursor }, anonymous)).value);
  expect(second).toEqual({ items: [expect.objectContaining({ id: "c" })] });

  expect(ids.parse(page.parse((await capability("business.list", { namePrefix: "Alamo" }, anonymous)).value).items)).toEqual(["a"]);
  expect(ids.parse(page.parse((await capability("business.list", { activityArea: { categoryId: "category", subcategoryId: "subcategory" } }, anonymous)).value).items)).toEqual(["a", "b", "c"]);
  expect(ids.parse(page.parse((await capability("business.list", { categoryId: "category" }, anonymous)).value).items)).toEqual(["a", "b", "c"]);
  expect(page.parse((await capability("business.list", { activityArea: { categoryId: "other", subcategoryId: "retired" } }, anonymous)).value).items).toEqual([]);
  expect((await capability("business.list", { cursor: "invalid" }, anonymous)).error).toBe("BusinessCatalogCursorError");
});

test("business catalog continues past a page the byte window cut short", async () => {
  await catalogTaxonomy();
  // Transferred legacy bodies skip the 1000-character validation; three of these overflow one D1 page.
  const large = (id: string, title: string) => business(id, title, { description: "x".repeat(400_000) });
  await seed(large("a", "Alfa"), large("b", "Bravo"));
  await seed(large("c", "Charlie"), business("d", "Delta"));

  expect(ids.parse((await capability("business.sitemap", null, anonymous)).value)).toEqual(["a", "b", "c", "d"]);
  const first = page.parse((await capability("business.list", { limit: 10 }, anonymous)).value);
  const rest = first.nextCursor ? page.parse((await capability("business.list", { limit: 10, cursor: first.nextCursor }, anonymous)).value).items : [];
  expect([...first.items, ...rest].map(item => item.id)).toEqual(["a", "b", "c", "d"]);
});

test("business catalog sitemap, represented areas and preview read every D1 page", async () => {
  await catalogTaxonomy();
  await seed(...Array.from({ length: 30 }, (_, index) => business(`p${String(index).padStart(2, "0")}`, `Negócio ${String(index).padStart(2, "0")}`)));
  await seed(business("deleted-area", "Zulu", { activityAreas: [{ categoryId: "other", subcategoryId: "retired" }] }));

  const sitemap = ids.parse((await capability("business.sitemap", null, anonymous)).value);
  expect(sitemap).toHaveLength(30);
  expect(sitemap).not.toContain("deleted-area");

  expect((await capability("business.areas", null, anonymous)).value).toEqual(expect.arrayContaining([
    { categoryId: "category", subcategoryId: "subcategory" },
    { categoryId: "other", subcategoryId: "retired" },
  ]));

  const preview = ids.parse((await capability("business.preview", { categoryId: "category", civilDate: "2026-10-12" }, anonymous)).value);
  expect(preview).toHaveLength(6);
  expect(ids.parse((await capability("business.preview", { categoryId: "category", civilDate: "2026-10-12" }, anonymous)).value)).toEqual(preview);
  expect((await capability("business.preview", { categoryId: "category", civilDate: "12/10/2026" }, anonymous)).error).toBe("TypeError");
});

test("business catalog assesses the owner's own D1 profiles by id and refuses others", async () => {
  await catalogTaxonomy();
  await seed(
    business("ready", "Pronto"),
    business("retired", "Retirado", { contacts: [], activityAreas: [{ categoryId: "other", subcategoryId: "retired" }] }),
    business("foreign", "Alheio", { userId: "someone-else" }),
  );
  const owner = { actor: ownerActor };
  const readiness = z.array(z.object({ business: z.object({ id: z.string() }).nullable(), missing: z.array(z.string()) }))
    .parse((await capability("business.assessOwned", { ids: ["ready", "retired"] }, owner)).value);
  expect(readiness).toEqual([
    { business: expect.objectContaining({ id: "ready" }), missing: [] },
    { business: null, missing: ["contact", "activityArea"] },
  ]);
  expect((await capability("business.assessOwned", { ids: ["foreign"] }, owner)).error).toBe("AdvertiserProfileAccessError");
  expect((await capability("business.assessOwned", { ids: ["ready"] }, anonymous)).error).toBe("AdvertiserProfileAccessError");
  expect((await capability("business.assessOwned", { ids: "ready" }, owner)).error).toBe("ZodError");
});
