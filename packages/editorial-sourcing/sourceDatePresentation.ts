import { formatSaoPauloDateTime } from "@tudomacae/civil-time";

export interface SourceDatePresentationInput {
  reportedAt?: number | null;
  accessedAt?: number;
}

export function sourceDatePresentationText(source: SourceDatePresentationInput): string | undefined {
  const parts = [
    source.reportedAt === null
      ? "Data original não informada pela fonte"
      : source.reportedAt !== undefined
        ? `Data da fonte: ${formatSaoPauloDateTime(source.reportedAt)}`
        : undefined,
    source.accessedAt !== undefined
      ? `Consultada em: ${formatSaoPauloDateTime(source.accessedAt)}`
      : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
