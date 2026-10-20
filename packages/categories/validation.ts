import { z } from "zod";

// Base schemas
export const categoryRecordSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug must be less than 100 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens",
    ),
  order: z.number().finite("Order must be finite"),
  businessOrder: z.number().finite("Business order must be finite").optional(),
  preferredLayer: z.enum(["ads", "businesses"]).optional(),
  isActive: z.boolean(),
  icon: z.string().optional(),
});

export const subcategoryRecordSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug must be less than 100 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens",
    ),
  order: z.number().finite("Order must be finite"),
  businessOrder: z.number().finite("Business order must be finite").optional(),
  isActive: z.boolean(),
});

// Extended schemas for use-cases
export const createCategorySchema = categoryRecordSchema;

export const updateCategorySchema = categoryRecordSchema.extend({
  id: z.string().min(1, "Category ID is required"),
});

export const createSubcategorySchema = subcategoryRecordSchema.extend({
  categoryId: z.string().min(1, "Category ID is required"),
});

export const updateSubcategorySchema = subcategoryRecordSchema.extend({
  categoryId: z.string().min(1, "Category ID is required"),
  subcategoryId: z.string().min(1, "Subcategory ID is required"),
});

export const deleteCategorySchema = z.object({
  id: z.string().min(1, "Category ID is required"),
});

export const deleteSubcategorySchema = z.object({
  categoryId: z.string().min(1, "Category ID is required"),
  subcategoryId: z.string().min(1, "Subcategory ID is required"),
});

// Type exports
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;
export type UpdateSubcategoryInput = z.infer<typeof updateSubcategorySchema>;
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;
export type DeleteSubcategoryInput = z.infer<typeof deleteSubcategorySchema>;
