export interface BusinessCategory {
  id: string;
  name: string;
  slug: string;
  order: number;
  businessOrder?: number;
  isActive: boolean;
  subcategories: {
    id: string;
    name: string;
    slug?: string;
    order: number;
    businessOrder?: number;
    isActive: boolean;
  }[];
}

type Ranked = { id: string; order: number; businessOrder?: number };
function businessRank<T extends Ranked>(left: T, right: T): number {
  return (left.businessOrder ?? left.order) - (right.businessOrder ?? right.order)
    || left.id.localeCompare(right.id);
}
export function orderBusinessTaxonomy<T extends BusinessCategory>(categories: T[]): T[] {
  return categories.map(category => ({
    ...category,
    subcategories: [...category.subcategories].sort(businessRank),
  })).sort(businessRank);
}
