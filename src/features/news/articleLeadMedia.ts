import { articleHeaderMediaIds } from "@/packages/editorial";

/** Feature alias for the shared Editorial header-media policy. */
export function articleLeadMediaIds(article: {
  mediaIds: string[];
  leadMediaId?: string | null;
  legacyHeaderMediaIds?: string[] | undefined;
}) {
  return articleHeaderMediaIds(article);
}
