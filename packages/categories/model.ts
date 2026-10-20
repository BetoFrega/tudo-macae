export type { CategoryWithSubcategories as Category } from "./categoryCatalog";
export type { CategoryRecord, SubcategoryRecord } from "./categoryManagement";
import type { SubcategoryRecord } from "./categoryManagement";
export type Subcategory = Omit<SubcategoryRecord, "categoryId">;
