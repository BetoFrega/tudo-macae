export interface ArticleMediaRoles {
  mediaIds: readonly string[];
  leadMediaId?: string | null;
  legacyHeaderMediaIds?: readonly string[] | undefined;
}

/** Returns the media used in the header, retaining the pre-role gallery only when the lead is absent. */
export function articleHeaderMediaIds(roles: ArticleMediaRoles): string[] {
  if (roles.leadMediaId !== undefined) {
    return roles.leadMediaId === null ? [] : [roles.leadMediaId];
  }
  return [...(roles.legacyHeaderMediaIds ?? roles.mediaIds)];
}

/** Resolves stored legacy gallery IDs without promoting inline body media. */
export function resolveLegacyHeaderMediaIds(input: ArticleMediaRoles & {
  bodyHasMedia?: boolean;
  replaceFromMedia?: boolean;
}): string[] {
  if (input.leadMediaId !== undefined) return [];
  if (input.replaceFromMedia) return [...input.mediaIds];
  if (input.legacyHeaderMediaIds !== undefined) return [...input.legacyHeaderMediaIds];
  return input.bodyHasMedia ? [] : [...input.mediaIds];
}
