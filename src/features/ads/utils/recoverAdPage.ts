import { InvalidAdCursorError, type PublicAdPage } from "@tudomacae/ads/publicDiscovery";

export async function recoverAdPage<T>(read: () => Promise<PublicAdPage<T>>): Promise<PublicAdPage<T> & { invalidCursor?: true }> {
  try {
    return await read();
  }
  catch (error) {
    if (!(error instanceof InvalidAdCursorError)) throw error;
    return { items: [], invalidCursor: true };
  }
}

export function adPageRedirectPath(path: string, cursor: unknown, page: { invalidCursor?: true }) {
  return !page.invalidCursor && typeof cursor === "string" && cursor.length > 0
    ? path + "?adCursor=" + encodeURIComponent(cursor) + "#anuncios"
    : path;
}

export function validatedAdPageRedirectPath(path: string, cursor: unknown, validate: () => unknown) {
  try {
    validate();
    return adPageRedirectPath(path, cursor, {});
  }
  catch (error) {
    if (!(error instanceof InvalidAdCursorError)) throw error;
    return path;
  }
}
