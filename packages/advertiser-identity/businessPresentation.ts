import { slugify } from "@tudomacae/text-normalization/slugify";
import type { BusinessReadinessGap } from "./business";

const gapLabels: Record<BusinessReadinessGap, string> = {
  identity: "identificação do responsável",
  name: "nome",
  contact: "contato",
  activityArea: "Área de atuação ativa",
};

export function businessMissingRequirements(missing: BusinessReadinessGap[]): string {
  return missing.map(gap => gapLabels[gap]).join(", ");
}

export function businessCanonicalPath(business: { id: string; title: string }) {
  return `/negocio/${business.id}/${slugify(business.title)}`;
}

export function businessMetadataDescription(business: {
  title: string;
  description?: string;
}) {
  const supplied = business.description?.trim().replace(/\s+/gu, " ");
  const description = supplied
    || `Encontre informações e contatos de ${business.title}, negócio de Macaé, no Tudo Macaé.`;
  if (description.length <= 160) return description;
  const shortened = description.slice(0, 157).replace(/\s+\S*$/u, "").trimEnd();
  return `${shortened}…`;
}

export interface ResolvedBusinessActivity {
  categoryId: string;
  subcategoryId: string;
  categoryName: string;
  subcategoryName: string;
  href: string;
}
