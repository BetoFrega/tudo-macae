import { z } from "zod";
import { CategoryManagementError, type CategoryManagementStore, type CategoryRecord, type SubcategoryRecord } from "@tudomacae/categories/categoryManagement";
import type { ClassifiedsPersistence, Transaction } from "@tudomacae/classifieds-persistence";
import { IdempotencyConflict, PersistenceConflict } from "@tudomacae/classifieds-persistence";
import { allRecords, jsonValue, parseStored, publicPage } from "./classifiedsSupport";

const categorySchema = z.object({
  id: z.string(), name: z.string(), slug: z.string(), order: z.number().finite(), isActive: z.boolean(),
  businessOrder: z.number().optional(), preferredLayer: z.enum(["ads", "businesses"]).optional(), icon: z.string().optional(),
});
const subcategorySchema = categorySchema.omit({ icon: true, preferredLayer: true }).extend({ categoryId: z.string() });
const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), record: categorySchema }),
  z.object({ status: z.enum(["duplicate", "parentNotFound", "parentDeleting"]) }),
]);
class CreationRefused extends Error {
  constructor(readonly status: "duplicate" | "parentNotFound" | "parentDeleting") { super(status); }
}

function appendRank(maximum: unknown) {
  if (maximum === undefined) return 0;
  const rank = parseStored(z.number().finite(), maximum);
  if (!Number.isFinite(rank + 1) || rank + 1 <= rank) throw new RangeError("A próxima ordem não é representável; informe uma ordem explícita.");
  return rank + 1;
}

export function createClassifiedsCategoryStores(dependencies: {
  persistence: ClassifiedsPersistence; actorId: string; now(): number; newId(): string;
}) {
  const store = dependencies.persistence;
  async function occupied(tx: Transaction, slug: string, id?: string, categoryId?: string) {
    const claim = await tx.read("slugClaim", slug, categoryId);
    if (claim && (categoryId ? claim.body.subcategoryId : claim.body.categoryId) !== id) return true;
    const page = await tx.page({ kind: categoryId ? "subcategory" : "category", slug, ...(categoryId ? { categoryId } : {}), limit: 1 });
    return page.items.some(record => record.id !== id);
  }
  async function releaseClaim(tx: Transaction, slug: string, id: string, categoryId?: string) {
    const current = await tx.read("slugClaim", slug, categoryId);
    if ((categoryId ? current?.body.subcategoryId : current?.body.categoryId) === id) tx.remove("slugClaim", slug, categoryId);
  }
  const management: CategoryManagementStore = {
    async listCategories(input) {
      const page = await publicPage(store, { kind: "category", order: "rank" }, input.limit ?? 20, input.cursor, "order");
      return { ...page, items: page.items.map(item => parseStored(categorySchema, { ...item.body, id: item.id })) };
    },
    async listSubcategories(input) {
      if (!await store.read("category", input.categoryId)) throw new CategoryManagementError("notFound", "Categoria não encontrada.");
      const page = await publicPage(store, { kind: "subcategory", categoryId: input.categoryId, order: "rank" }, input.limit ?? 20, input.cursor, "order");
      return { ...page, items: page.items.map(item => parseStored(subcategorySchema, { ...item.body, id: item.id })) };
    },
    async createCategory(input) {
      const id = dependencies.newId();
      const now = dependencies.now();
      try {
        const result = await store.transact({ actorId: dependencies.actorId, key: input.idempotencyKey, operation: "category.create", input: jsonValue(input) }, async (tx) => {
          if (await occupied(tx, input.slug)) throw new CreationRefused("duplicate");
          const latest = input.order === undefined ? await tx.page({ kind: "category", order: "rankDesc", limit: 1 }) : null;
          const { idempotencyKey: _, ...fields } = input;
          const record: CategoryRecord = { ...fields, id, order: input.order ?? appendRank(latest?.items[0]?.body.order) };
          if (await tx.read("category", id)) throw new PersistenceConflict();
          tx.put({ kind: "category", id, body: { ...fields, order: record.order, createdAt: now, updatedAt: now } });
          tx.put({ kind: "slugClaim", id: input.slug, body: { categoryId: id, createdAt: now } });
          return jsonValue({ status: "created", record });
        });
        const value = parseStored(resultSchema, result.value);
        return value.status === "created" ? { ...value, status: result.replayed ? "replayed" : "created" } : value;
      }
      catch (error) {
        if (error instanceof CreationRefused) return { status: error.status };
        if (error instanceof IdempotencyConflict) return { status: "idempotencyConflict" };
        throw error;
      }
    },
    async createSubcategory(input) {
      const id = dependencies.newId();
      const now = dependencies.now();
      try {
        const result = await store.transact({ actorId: dependencies.actorId, key: input.idempotencyKey, operation: "subcategory.create", input: jsonValue(input) }, async (tx) => {
          const parent = await tx.read("category", input.categoryId);
          if (!parent) throw new CreationRefused("parentNotFound");
          if (parent.body.deleting === true) throw new CreationRefused("parentDeleting");
          if (await occupied(tx, input.slug, undefined, input.categoryId)) throw new CreationRefused("duplicate");
          const latest = input.order === undefined ? await tx.page({ kind: "subcategory", categoryId: input.categoryId, order: "rankDesc", limit: 1 }) : null;
          const { idempotencyKey: _, ...fields } = input;
          const record: SubcategoryRecord = { ...fields, id, order: input.order ?? appendRank(latest?.items[0]?.body.order) };
          if (await tx.read("subcategory", id, input.categoryId)) throw new PersistenceConflict();
          tx.put({ kind: "subcategory", id, body: { ...fields, order: record.order, createdAt: now, updatedAt: now } });
          tx.put({ kind: "slugClaim", id: input.slug, namespace: input.categoryId, body: { subcategoryId: id, createdAt: now } });
          return jsonValue({ status: "created", record });
        });
        const value = parseStored(z.discriminatedUnion("status", [z.object({ status: z.literal("created"), record: subcategorySchema }), z.object({ status: z.enum(["duplicate", "parentNotFound", "parentDeleting"]) })]), result.value);
        return value.status === "created" ? { ...value, status: result.replayed ? "replayed" : "created" } : value;
      }
      catch (error) {
        if (error instanceof CreationRefused) return { status: error.status };
        if (error instanceof IdempotencyConflict) return { status: "idempotencyConflict" };
        throw error;
      }
    },
    async updateCategory(input) {
      const now = dependencies.now();
      const result = await store.transact(null, async (tx) => {
        const current = await tx.read("category", input.id);
        if (!current) return { status: "notFound" };
        if (await occupied(tx, input.slug, input.id)) return { status: "duplicate" };
        if (current.body.slug !== input.slug) await releaseClaim(tx, String(current.body.slug), input.id);
        const { id: _, ...fields } = input;
        const body = { ...current.body, ...fields, updatedAt: now };
        if (input.businessOrder === undefined) delete body.businessOrder;
        if (input.preferredLayer === undefined) delete body.preferredLayer;
        const record = parseStored(categorySchema, { ...body, id: input.id });
        tx.put({ kind: "category", id: input.id, body });
        tx.put({ kind: "slugClaim", id: input.slug, body: { categoryId: input.id, updatedAt: now } });
        return jsonValue({ status: "updated", record });
      });
      return parseStored(z.discriminatedUnion("status", [z.object({ status: z.literal("updated"), record: categorySchema }), z.object({ status: z.enum(["notFound", "duplicate"]) })]), result.value);
    },
  };
  const categories = {
    async findBySlug(slug: string) {
      const page = await store.page({ kind: "category", slug, limit: 1 });
      const item = page.items[0];
      return item ? parseStored(categorySchema, { ...item.body, id: item.id }) : null;
    },
    async beginDeletion(id: string) {
      const now = dependencies.now();
      await store.transact(null, async (tx) => {
        const current = await tx.read("category", id);
        if (current && current.body.deleting !== true) tx.put({ ...current, body: { ...current.body, deleting: true, updatedAt: now } });
        return null;
      });
    },
    async listSubcategories(id: string) {
      return (await allRecords(store, { kind: "subcategory", categoryId: id })).items.map(item => ({ categoryId: id, subcategoryId: item.id }));
    },
    async delete(id: string) {
      await store.transact(null, async (tx) => {
        const current = await tx.read("category", id);
        if (!current) return null;
        if (current.body.deleting !== true || (await tx.page({ kind: "subcategory", categoryId: id, limit: 1 })).items.length) throw new CategoryManagementError("conflict", "A limpeza da Categoria ainda está pendente.");
        await releaseClaim(tx, String(current.body.slug), id);
        tx.remove("category", id);
        return null;
      });
    },
  };
  const subcategories = {
    async findBySlug(categoryId: string, slug: string) {
      const page = await store.page({ kind: "subcategory", categoryId, slug, limit: 1 });
      const item = page.items[0];
      return item ? parseStored(subcategorySchema, { ...item.body, id: item.id }) : null;
    },
    async update(categoryId: string, id: string, fields: Omit<SubcategoryRecord, "id" | "categoryId">) {
      const now = dependencies.now();
      await store.transact(null, async (tx) => {
        const current = await tx.read("subcategory", id, categoryId);
        if (!current) throw new TypeError("Subcategoria não encontrada.");
        if (await occupied(tx, fields.slug, id, categoryId)) throw new CategoryManagementError("duplicate", "O slug já está em uso.");
        if (current.body.slug !== fields.slug) await releaseClaim(tx, String(current.body.slug), id, categoryId);
        const body = { ...current.body, ...fields, updatedAt: now };
        if (fields.businessOrder === undefined) delete body.businessOrder;
        tx.put({ kind: "subcategory", id, body });
        tx.put({ kind: "slugClaim", id: fields.slug, namespace: categoryId, body: { subcategoryId: id, updatedAt: now } });
        return null;
      });
    },
    async deactivateIfPresent(area: { categoryId: string; subcategoryId: string }) {
      const now = dependencies.now();
      await store.transact(null, async (tx) => {
        const current = await tx.read("subcategory", area.subcategoryId, area.categoryId);
        if (current && current.body.deleting !== true) tx.put({ ...current, body: { ...current.body, isActive: false, deleting: true, updatedAt: now } });
        return null;
      });
    },
    async delete(area: { categoryId: string; subcategoryId: string }) {
      await store.transact(null, async (tx) => {
        const current = await tx.read("subcategory", area.subcategoryId, area.categoryId);
        if (!current) return null;
        if (current.body.deleting !== true || (await tx.page({ kind: "profile", activityArea: area, limit: 1 })).items.length) throw new CategoryManagementError("conflict", "A limpeza da Área ainda está pendente.");
        await releaseClaim(tx, String(current.body.slug), area.subcategoryId, area.categoryId);
        tx.remove("subcategory", area.subcategoryId, area.categoryId);
        return null;
      });
    },
  };
  return { management, categories, subcategories };
}
