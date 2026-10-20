import { z } from "zod";

const textSchema = z.string().trim().min(1).max(100);
const rankSchema = z.number().finite();
const preferredLayerSchema = z.enum(["ads", "businesses"]);
const optionalIconSchema = z.string().trim().transform(value => value || undefined).optional();
const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().trim().min(1).optional(),
});

export const listCategoriesInputSchema = pageSchema;
export const listSubcategoriesInputSchema = pageSchema.extend({
  categoryId: z.string().trim().min(1),
});
export const createCategoryInputSchema = z.strictObject({
  name: textSchema,
  slug: z.string().trim().min(1).max(100).optional(),
  order: rankSchema.optional(),
  businessOrder: rankSchema.optional(),
  preferredLayer: preferredLayerSchema.optional(),
  isActive: z.boolean(),
  icon: optionalIconSchema,
  idempotencyKey: z.string().trim().min(1),
});
export const createSubcategoryInputSchema = z.strictObject({
  categoryId: z.string().trim().min(1),
  name: textSchema,
  slug: z.string().trim().min(1).max(100).optional(),
  order: rankSchema.optional(),
  businessOrder: rankSchema.optional(),
  isActive: z.boolean(),
  idempotencyKey: z.string().trim().min(1),
});
export const updateCategoryInputSchema = z.strictObject({
  id: z.string().trim().min(1),
  name: textSchema,
  slug: z.string().trim().min(1).max(100),
  order: rankSchema,
  businessOrder: rankSchema.optional(),
  preferredLayer: preferredLayerSchema.optional(),
  isActive: z.boolean(),
  icon: optionalIconSchema,
});

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  order: number;
  businessOrder?: number;
  preferredLayer?: "ads" | "businesses";
  isActive: boolean;
  icon?: string;
}

export interface SubcategoryRecord {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  order: number;
  businessOrder?: number;
  isActive: boolean;
}

export interface CategoryPage<T> {
  items: T[];
  nextCursor?: string;
}

type CategoryCreation = Omit<CategoryRecord, "id" | "order"> & {
  order?: number;
  idempotencyKey: string;
};
type SubcategoryCreation = Omit<SubcategoryRecord, "id" | "order"> & {
  order?: number;
  idempotencyKey: string;
};

export type CategoryWriteResult<T>
  = | { status: "created" | "replayed"; record: T }
    | { status: "duplicate" | "idempotencyConflict" | "parentNotFound" | "parentDeleting" };

export type CategoryUpdateResult
  = | { status: "updated"; record: CategoryRecord }
    | { status: "duplicate" | "notFound" };

export class CategoryManagementError extends Error {
  constructor(
    public readonly code: "validationFailed" | "duplicate" | "notFound" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "CategoryManagementError";
  }
}

export interface CategoryManagementStore {
  listCategories(input: z.output<typeof listCategoriesInputSchema>): Promise<CategoryPage<CategoryRecord>>;
  listSubcategories(input: z.output<typeof listSubcategoriesInputSchema>): Promise<CategoryPage<SubcategoryRecord>>;
  createCategory(input: CategoryCreation): Promise<CategoryWriteResult<CategoryRecord>>;
  createSubcategory(input: SubcategoryCreation): Promise<CategoryWriteResult<SubcategoryRecord>>;
  updateCategory(input: CategoryRecord): Promise<CategoryUpdateResult>;
}

function resolvedSlug(
  input: { name: string; slug?: string | undefined },
  slugify: (text: string) => string,
): string {
  const slug = slugify(input.slug ?? input.name);
  if (!slug || slug === "-") {
    throw new CategoryManagementError("validationFailed", "Informe um slug válido.");
  }
  return slug;
}

function unwrapWrite<T>(result: CategoryWriteResult<T>): { status: "created" | "replayed"; record: T } {
  if (result.status === "duplicate") {
    throw new CategoryManagementError("duplicate", "O slug já está em uso.");
  }
  if (result.status === "idempotencyConflict") {
    throw new CategoryManagementError("conflict", "A chave de idempotência já identifica outra criação.");
  }
  if (result.status === "parentNotFound") {
    throw new CategoryManagementError("notFound", "Categoria não encontrada.");
  }
  if (result.status === "parentDeleting") {
    throw new CategoryManagementError("conflict", "A Categoria está sendo excluída.");
  }
  if (result.status === "created" || result.status === "replayed") return result;
  throw new CategoryManagementError("conflict", "A criação não pôde ser concluída.");
}

function unwrapUpdate(result: CategoryUpdateResult): CategoryRecord {
  if (result.status === "updated") return result.record;
  if (result.status === "notFound") {
    throw new CategoryManagementError("notFound", "Categoria não encontrada.");
  }
  if (result.status === "duplicate") {
    throw new CategoryManagementError("duplicate", "O slug já está em uso.");
  }
  throw new CategoryManagementError("conflict", "A atualização não pôde ser concluída.");
}

/** Pure Category boundary; persistence and icon vocabulary are controlled dependencies. */
export function createCategoryManagement(dependencies: {
  store: CategoryManagementStore;
  slugify(text: string): string;
  isSupportedIcon(name: string): boolean;
}) {
  return {
    async listCategories(input: unknown = {}) {
      return dependencies.store.listCategories(listCategoriesInputSchema.parse(input));
    },
    async listSubcategories(input: unknown) {
      return dependencies.store.listSubcategories(listSubcategoriesInputSchema.parse(input));
    },
    async createCategory(input: unknown) {
      const value = createCategoryInputSchema.parse(input);
      if (value.icon && !dependencies.isSupportedIcon(value.icon)) {
        throw new CategoryManagementError("validationFailed", "Informe um ícone Lucide válido.");
      }
      return unwrapWrite(await dependencies.store.createCategory({
        name: value.name,
        slug: resolvedSlug(value, dependencies.slugify),
        ...(value.order !== undefined ? { order: value.order } : {}),
        ...(value.businessOrder !== undefined ? { businessOrder: value.businessOrder } : {}),
        ...(value.preferredLayer ? { preferredLayer: value.preferredLayer } : {}),
        isActive: value.isActive,
        ...(value.icon ? { icon: value.icon } : {}),
        idempotencyKey: value.idempotencyKey,
      }));
    },
    async createSubcategory(input: unknown) {
      const value = createSubcategoryInputSchema.parse(input);
      return unwrapWrite(await dependencies.store.createSubcategory({
        categoryId: value.categoryId,
        name: value.name,
        slug: resolvedSlug(value, dependencies.slugify),
        ...(value.order !== undefined ? { order: value.order } : {}),
        ...(value.businessOrder !== undefined ? { businessOrder: value.businessOrder } : {}),
        isActive: value.isActive,
        idempotencyKey: value.idempotencyKey,
      }));
    },
    async updateCategory(input: unknown) {
      const value = updateCategoryInputSchema.parse(input);
      if (value.icon && !dependencies.isSupportedIcon(value.icon)) {
        throw new CategoryManagementError("validationFailed", "Informe um ícone Lucide válido.");
      }
      return unwrapUpdate(await dependencies.store.updateCategory({
        id: value.id,
        name: value.name,
        slug: resolvedSlug(value, dependencies.slugify),
        order: value.order,
        ...(value.businessOrder !== undefined ? { businessOrder: value.businessOrder } : {}),
        ...(value.preferredLayer ? { preferredLayer: value.preferredLayer } : {}),
        isActive: value.isActive,
        ...(value.icon ? { icon: value.icon } : {}),
      }));
    },
  };
}
