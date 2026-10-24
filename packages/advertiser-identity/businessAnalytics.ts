interface SourceInput {
  source: string;
}

const BUSINESS_SOURCES = new Set([
  "activity_preview",
  "catalog",
  "direct",
  "home",
  "navigation",
  "business_profile",
]);

export function normalizeBusinessAnalyticsSource(source: string | undefined) {
  return source && BUSINESS_SOURCES.has(source) ? source : "direct";
}

interface BusinessInput extends SourceInput {
  businessId: string;
  categoryId?: string;
  subcategoryId?: string;
}

function identifiers(input: BusinessInput) {
  return {
    source_surface: input.source,
    business_id: input.businessId,
    ...(input.categoryId ? { category_id: input.categoryId } : {}),
    ...(input.subcategoryId ? { subcategory_id: input.subcategoryId } : {}),
  };
}

export function businessOpenedEvent(input: BusinessInput) {
  return {
    name: "business_opened",
    properties: identifiers(input),
  } as const;
}

export function businessContactEvent(input: BusinessInput & {
  kind: "phone" | "whatsapp";
  adId?: string;
}) {
  return {
    name: "business_contact_clicked",
    properties: {
      ...identifiers(input),
      contact_kind: input.kind,
      ...(input.adId ? { ad_id: input.adId } : {}),
    },
  } as const;
}

export function businessCatalogEnteredEvent(input: SourceInput) {
  return {
    name: "business_catalog_entered",
    properties: { source_surface: input.source },
  } as const;
}

export function businessActivityEvent(input: SourceInput & {
  categoryId: string;
  subcategoryId: string;
}) {
  return {
    name: "business_activity_selected",
    properties: {
      source_surface: input.source,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
    },
  } as const;
}
