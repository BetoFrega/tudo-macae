import { mediaKinds, mediaStatuses, type MediaKind, type MediaStatus } from "../model";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface MediaSearchInput {
  kind?: MediaKind;
  status?: MediaStatus;
  text?: string;
  credit?: string;
  provenance?: string;
  limit?: number;
  cursor?: string;
}

export interface MediaSearchCursor {
  filters: string;
  createdAt: number;
  id: string;
}

export interface ValidatedMediaSearchInput {
  kind?: MediaKind;
  status?: MediaStatus;
  text?: string;
  credit?: string;
  provenance?: string;
  limit: number;
  filters: string;
  cursor?: MediaSearchCursor;
}

export function normalizeMediaSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function normalizedFilter(value: string | undefined, message: string) {
  if (value === undefined) return undefined;
  const normalized = normalizeMediaSearchText(value);
  if (!normalized) throw new TypeError(message);
  return normalized;
}

function decodeCursor(
  cursor: string | undefined,
  filters: string,
): MediaSearchCursor | undefined {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (!parsed || typeof parsed !== "object") throw new Error();
    const candidate = parsed as Record<string, unknown>;
    if (candidate.filters !== filters
      || !Number.isFinite(candidate.createdAt)
      || typeof candidate.id !== "string"
      || !candidate.id) {
      throw new Error();
    }
    return candidate as unknown as MediaSearchCursor;
  }
  catch {
    throw new TypeError("O cursor da busca de Mídias é inválido.");
  }
}

export function encodeMediaSearchCursor(cursor: MediaSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function validatedLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new TypeError("A busca aceita entre 1 e 50 Mídias por página.");
  }
  return value;
}

interface MediaSearchFilters {
  kind: MediaKind | undefined;
  status: MediaStatus | undefined;
  text: string | undefined;
  credit: string | undefined;
  provenance: string | undefined;
}

/** Inputs arrive as untyped JSON; an unknown value, even an empty one, must not silently drop its filter. */
function enumFilter<T extends string>(value: T | undefined, allowed: readonly T[], message: string) {
  if (value !== undefined && !allowed.includes(value)) throw new TypeError(message);
  return value;
}

function normalizedFilters(input: MediaSearchInput): MediaSearchFilters {
  return {
    kind: enumFilter(input.kind, mediaKinds, "Informe um tipo de Mídia válido para a busca."),
    status: enumFilter(input.status, mediaStatuses, "Informe um estado de Mídia válido para a busca."),
    text: normalizedFilter(input.text, "Informe um texto válido para a busca."),
    credit: normalizedFilter(
      input.credit,
      "Informe um crédito válido para a busca.",
    ),
    provenance: normalizedFilter(
      input.provenance,
      "Informe uma Procedência válida para a busca.",
    ),
  };
}

function filtersKey(filters: MediaSearchFilters): string {
  return JSON.stringify({
    kind: filters.kind ?? null,
    status: filters.status ?? null,
    text: filters.text ?? null,
    credit: filters.credit ?? null,
    provenance: filters.provenance ?? null,
  });
}

function presentFilters(filters: MediaSearchFilters) {
  return {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.text ? { text: filters.text } : {}),
    ...(filters.credit ? { credit: filters.credit } : {}),
    ...(filters.provenance ? { provenance: filters.provenance } : {}),
  };
}

export function validateMediaSearchInput(
  input: MediaSearchInput,
): ValidatedMediaSearchInput {
  // Any other JSON value would read every filter as absent and widen the search to the whole catalog.
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("Informe os filtros da busca de Mídias como um objeto.");
  const limit = validatedLimit(input.limit);
  const normalized = normalizedFilters(input);
  const filters = filtersKey(normalized);
  const cursor = decodeCursor(input.cursor, filters);
  return {
    limit,
    filters,
    ...presentFilters(normalized),
    ...(cursor ? { cursor } : {}),
  };
}
