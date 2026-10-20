export function adListingTags(
  ...inputs: Array<{
    categoryId: string;
    subcategoryId?: string | undefined;
  }>
): string[] {
  const tags = new Set<string>();

  for (const input of inputs) {
    tags.add(`ads-category-${input.categoryId}`);
    if (input.subcategoryId) {
      tags.add(`ads-subcategory-${input.subcategoryId}`);
    }
  }

  return [...tags];
}
