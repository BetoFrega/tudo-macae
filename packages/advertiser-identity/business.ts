import type { ActivityArea, AdvertiserProfileData } from "./model";
import { deterministicRotationScore } from "./lib/deterministicRotation";
import {
  assessBusiness,
  decodeCursor,
  encodeCursor,
  isPublicCatalogCandidate,
  normalizeBusinessName,
  queryKey,
  toBusiness,
  type ActiveActivityAreas,
  type BusinessCatalogPosition,
  type BusinessCatalogStore,
  type BusinessPublicData,
  type BusinessReadiness,
} from "./lib/businessCatalogRules";

export {
  BusinessCatalogCursorError,
  normalizeBusinessName,
} from "./lib/businessCatalogRules";
export type {
  BusinessCatalogCandidatePage,
  BusinessCatalogPosition,
  BusinessPublicData,
  BusinessReadiness,
  BusinessReadinessGap,
} from "./lib/businessCatalogRules";

export function createBusinessReader(dependencies: {
  store: Pick<BusinessCatalogStore, "getById">;
  activityAreas: ActiveActivityAreas;
}) {
  return {
    async read(input: { id: string }): Promise<BusinessPublicData | null> {
      if (!input.id.trim()) return null;
      const profile = await dependencies.store.getById(input.id);
      return profile ? toBusiness(profile, dependencies.activityAreas) : null;
    },
  };
}

type BusinessListInput = {
  namePrefix?: string;
  activityArea?: ActivityArea;
  categoryId?: string;
  cursor?: string;
  limit?: number;
};
type BusinessListPage = { items: BusinessPublicData[]; nextCursor?: string };
type BusinessListQuery = ReturnType<typeof businessListQuery>;

function businessListQuery(input: BusinessListInput) {
  const normalizedNamePrefix = normalizeBusinessName(input.namePrefix ?? "");
  const categoryId = input.categoryId?.trim();
  if (normalizedNamePrefix && input.activityArea) {
    throw new TypeError("Escolha busca por nome ou área de atuação, não ambos.");
  }
  const queryModes = [normalizedNamePrefix, input.activityArea, categoryId]
    .filter(Boolean).length;
  if (queryModes > 1) {
    throw new TypeError("Escolha busca por nome, Categoria ou Área de atuação, não mais de uma opção.");
  }
  const candidateFilter = {
    ...(normalizedNamePrefix ? { normalizedNamePrefix } : {}),
    ...(input.activityArea ? { activityArea: input.activityArea } : {}),
  };
  return {
    activityArea: input.activityArea,
    categoryId,
    candidateFilter,
    effective: { ...candidateFilter, ...(categoryId ? { categoryId } : {}) },
  };
}

function inCategory(business: BusinessPublicData, categoryId: string | undefined) {
  return !categoryId || business.activityAreas.some(area => area.categoryId === categoryId);
}

function fullPage(
  items: BusinessPublicData[],
  key: string,
  position: BusinessCatalogPosition,
  hasMore: boolean,
): BusinessListPage {
  return { items, ...(hasMore ? { nextCursor: encodeCursor(key, position) } : {}) };
}

async function categoryBusiness(
  profile: AdvertiserProfileData,
  categoryId: string,
  activityAreas: ActiveActivityAreas,
): Promise<BusinessPublicData | null> {
  if (!profile.activityAreas?.some(area => area.categoryId === categoryId)) return null;
  const business = await toBusiness(profile, activityAreas);
  return business && inCategory(business, categoryId) ? business : null;
}

export function createBusinessCatalog(dependencies: {
  store: BusinessCatalogStore;
  activityAreas: ActiveActivityAreas;
}) {
  async function collectBusinesses(
    query: BusinessListQuery,
    key: string,
    limit: number,
    after: BusinessCatalogPosition | undefined,
  ): Promise<BusinessListPage> {
    const items: BusinessPublicData[] = [];
    let position = after;
    while (items.length < limit) {
      const candidatePage = await dependencies.store.listCandidates({
        ...query.candidateFilter,
        ...(position ? { after: position } : {}),
        limit,
      });
      if (candidatePage.items.length === 0) return { items };
      for (const [index, candidate] of candidatePage.items.entries()) {
        position = candidate.position;
        const business = await toBusiness(candidate.profile, dependencies.activityAreas);
        if (business && inCategory(business, query.categoryId)) items.push(business);
        if (items.length === limit) {
          const hasMore = index < candidatePage.items.length - 1
            || candidatePage.next !== undefined;
          return fullPage(items, key, position, hasMore);
        }
      }
      if (!candidatePage.next) return { items };
      position = candidatePage.next;
    }
    return { items };
  }

  return {
    async assess(profile: AdvertiserProfileData): Promise<BusinessReadiness> {
      return assessBusiness(profile, dependencies.activityAreas);
    },
    async assessMany(profiles: AdvertiserProfileData[]): Promise<BusinessReadiness[]> {
      const checks = new Map<string, Promise<boolean>>();
      const activityAreas: ActiveActivityAreas = {
        isActive(area) {
          const key = `${area.categoryId}:${area.subcategoryId}`;
          let check = checks.get(key);
          if (!check) {
            check = dependencies.activityAreas.isActive(area);
            checks.set(key, check);
          }
          return check;
        },
      };
      return Promise.all(profiles.map(profile => assessBusiness(profile, activityAreas)));
    },
    async listAll(): Promise<BusinessPublicData[]> {
      const checks = new Map<string, Promise<boolean>>();
      const catalog = createBusinessCatalog({
        ...dependencies,
        activityAreas: {
          isActive(area) {
            const key = JSON.stringify([area.categoryId, area.subcategoryId]);
            let check = checks.get(key);
            if (!check) {
              check = dependencies.activityAreas.isActive(area);
              checks.set(key, check);
            }
            return check;
          },
        },
      });
      const items: BusinessPublicData[] = [];
      let cursor: string | undefined;
      do {
        const page = await catalog.list({ limit: 50, ...(cursor ? { cursor } : {}) });
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      return items;
    },
    async listRepresentedActivityAreas(): Promise<ActivityArea[]> {
      const represented = new Map<string, ActivityArea>();
      let position: BusinessCatalogPosition | undefined;
      do {
        const page = await dependencies.store.listCandidates({
          ...(position ? { after: position } : {}),
          limit: 50,
        });
        for (const { profile } of page.items) {
          if (!isPublicCatalogCandidate(profile)) continue;
          for (const area of profile.activityAreas ?? []) {
            represented.set(`${area.categoryId}:${area.subcategoryId}`, area);
          }
        }
        position = page.next;
      } while (position);
      return [...represented.values()];
    },
    async list(input: BusinessListInput): Promise<BusinessListPage> {
      const query = businessListQuery(input);
      if (query.activityArea && !(await dependencies.activityAreas.isActive(query.activityArea))) {
        return { items: [] };
      }
      const key = queryKey(query.effective);
      const after = input.cursor ? decodeCursor(input.cursor, key) : undefined;
      const limit = Math.min(50, Math.max(1, input.limit ?? 20));
      return collectBusinesses(query, key, limit, after);
    },
    async previewCategory(input: {
      categoryId: string;
      civilDate: string;
    }): Promise<BusinessPublicData[]> {
      const categoryId = input.categoryId.trim();
      if (!categoryId || !/^\d{4}-\d{2}-\d{2}$/u.test(input.civilDate)) {
        throw new TypeError("Categoria ou data civil inválida para o preview de Negócios.");
      }

      const ranked: Array<{
        business: BusinessPublicData;
        score: number;
      }> = [];
      const areaChecks = new Map<string, Promise<boolean>>();
      const activityAreas: ActiveActivityAreas = {
        isActive(area) {
          const key = `${area.categoryId}:${area.subcategoryId}`;
          let check = areaChecks.get(key);
          if (!check) {
            check = dependencies.activityAreas.isActive(area);
            areaChecks.set(key, check);
          }
          return check;
        },
      };
      let position: BusinessCatalogPosition | undefined;
      do {
        const page = await dependencies.store.listCandidates({
          ...(position ? { after: position } : {}),
          limit: 50,
        });
        for (const { profile } of page.items) {
          const business = await categoryBusiness(profile, categoryId, activityAreas);
          if (!business) continue;
          ranked.push({
            business,
            score: deterministicRotationScore(
              `${input.civilDate}:${business.id}:${categoryId}`,
            ),
          });
          ranked.sort((left, right) =>
            left.score - right.score || left.business.id.localeCompare(right.business.id));
          if (ranked.length > 6) ranked.pop();
        }
        position = page.next;
      } while (position);

      return ranked.map(candidate => candidate.business);
    },
    read: createBusinessReader(dependencies).read,
  };
}
