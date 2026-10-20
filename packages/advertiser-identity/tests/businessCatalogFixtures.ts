import {
  createBusinessCatalog,
  normalizeBusinessName,
  type BusinessCatalogCandidatePage,
} from "../business";
import type { AdvertiserProfileData } from "../model";

export const foodArea = { categoryId: "food", subcategoryId: "snacks" };
export const healthArea = { categoryId: "health", subcategoryId: "clinics" };

export function profile(
  id: string,
  title: string,
  fields: Partial<AdvertiserProfileData> = {},
): AdvertiserProfileData {
  return {
    id,
    userId: `owner-${id}`,
    title,
    description: `Descrição de ${title}`,
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [foodArea],
    createdAt: 1,
    updatedAt: 1,
    ...fields,
  };
}

export function fixture(
  records: AdvertiserProfileData[],
  isActive = async (area: { categoryId: string; subcategoryId: string }) => area.subcategoryId !== "inactive",
) {
  const calls: unknown[] = [];
  const catalog = createBusinessCatalog({
    activityAreas: {
      isActive,
    },
    store: {
      async getById(id) {
        return records.find(record => record.id === id) ?? null;
      },
      async listCandidates(input): Promise<BusinessCatalogCandidatePage> {
        calls.push(input);
        const filtered = records
          .filter(record => !input.normalizedNamePrefix
            || normalizeBusinessName(record.title).startsWith(input.normalizedNamePrefix))
          .filter(record => !input.activityArea
            || record.activityAreas?.some(area =>
              area.categoryId === input.activityArea?.categoryId
              && area.subcategoryId === input.activityArea.subcategoryId,
            ))
          .sort((left, right) =>
            normalizeBusinessName(left.title).localeCompare(normalizeBusinessName(right.title), "pt-BR")
            || left.id.localeCompare(right.id),
          );
        const start = input.after
          ? filtered.findIndex(record => record.id === input.after?.id) + 1
          : 0;
        const page = filtered.slice(start, start + input.limit);
        return {
          items: page.map(record => ({
            profile: record,
            position: {
              normalizedTitle: normalizeBusinessName(record.title),
              id: record.id,
            },
          })),
          ...(start + page.length < filtered.length && page.at(-1)
            ? {
                next: {
                  normalizedTitle: normalizeBusinessName(page.at(-1)!.title),
                  id: page.at(-1)!.id,
                },
              }
            : {}),
        };
      },
    },
  });
  return { catalog, calls };
}
