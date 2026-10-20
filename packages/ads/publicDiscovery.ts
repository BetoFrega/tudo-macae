import { z } from "zod";
import { publicationIdentifier } from "./validation";

export const PUBLIC_AD_PAGE_SIZE = 30;

function isPublicAdDocumentId(value: string) {
  const reserved = /^__[\s\S]*__$/u.test(value);
  const numeric = value.match(/^__id([1-9][0-9]{0,18})__$/u)?.[1];
  const imported = numeric !== undefined && (numeric.length < 19 || numeric <= "9223372036854775807");
  return value.isWellFormed() && !value.includes("/") && value !== "." && value !== ".." && (!reserved || imported);
}
const id = publicationIdentifier.refine(isPublicAdDocumentId, "Identificador inválido.");
// Publication drafts prefix a publication ID of up to 200 characters with "publication-".
const profileId = z.string().min(1).max(212).refine(isPublicAdDocumentId, "Identificador inválido.");
export function isPublicAdProfileId(value: unknown): value is string {
  return profileId.safeParse(value).success;
}

const position = z.object({
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  id: publicationIdentifier.refine(isPublicAdDocumentId, "Identificador inválido."),
}).strict();

export type AdPosition = z.infer<typeof position>;
export type AdScope
  = | { kind: "all" }
    | { kind: "category"; categoryId: string }
    | { kind: "subcategory"; categoryId: string; subcategoryId: string }
    | { kind: "profile"; profileId: string };

export interface PublicAdRecord {
  id: string;
  categoryId: string;
  subcategoryId: string;
  advertiserProfileId: string;
  title: string;
  slug: string;
  text: string;
  userId: string;
  status: "active" | "paused";
  createdAt: number;
  updatedAt?: number | undefined;
  images: { id: string; path: string; order: number; title?: string | undefined; description?: string | undefined }[];
}

export interface PublicAdPage<T = PublicAdRecord> {
  items: T[];
  nextCursor?: string;
}

export interface PublicAdStore {
  read(input: { scope: AdScope; limit: number; after?: AdPosition }): Promise<{
    items: PublicAdRecord[];
    lastScanned?: AdPosition;
    scanned: number;
    hasMore: boolean;
  }>;
}

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("category"), categoryId: id }),
  z.object({ kind: z.literal("subcategory"), categoryId: id, subcategoryId: id }),
  z.object({ kind: z.literal("profile"), profileId }),
]);
export class InvalidAdCursorError extends TypeError {
  constructor() {
    super("Página de anúncios inválida. Volte à primeira página.");
  }
}

const cursorSchema = z.string().min(1).max(8192).optional();
function parseCursor(input: unknown) {
  const cursor = cursorSchema.safeParse(input);
  if (!cursor.success) throw new InvalidAdCursorError();
  return cursor.data;
}

const requestSchema = z.object({
  scope: scopeSchema,
  limit: z.number().int().min(1).max(PUBLIC_AD_PAGE_SIZE).default(PUBLIC_AD_PAGE_SIZE),
  cursor: z.unknown().optional(),
});
const filterSchema = z.object({ categoryId: id, subcategoryId: id.optional(), cursor: z.unknown().optional() });

function decodeCursor(value: string, key: string): AdPosition {
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error();
    const decoded = z.object({ key: z.literal(key), after: position }).strict().parse(JSON.parse(bytes.toString("utf8")));
    if (Buffer.from(JSON.stringify(decoded)).toString("base64url") !== value) throw new Error();
    return decoded.after;
  }
  catch { throw new InvalidAdCursorError(); }
}

export function createPublicAdDiscovery(dependencies: {
  store: PublicAdStore;
  taxonomy: () => Promise<readonly { id: string; subcategories: readonly { id: string }[] }[]>;
}) {
  function canonical(input: unknown) {
    const request = requestSchema.parse(input);
    const key = JSON.stringify([request.scope, request.limit]);
    const cursor = parseCursor(request.cursor);
    const after = cursor === undefined ? undefined : decodeCursor(cursor, key);
    return { scope: request.scope, limit: request.limit, ...(after ? { after } : {}) };
  }

  return {
    canonical,
    async filtered(input: unknown) {
      const request = filterSchema.parse(input);
      const cursor = parseCursor(request.cursor);
      const categories = await dependencies.taxonomy();
      const category = categories.find(category => category.id === request.categoryId);
      if (!category || (request.subcategoryId && !category.subcategories.some(subcategory => subcategory.id === request.subcategoryId))) {
        throw new TypeError("Categoria ou subcategoria inválida.");
      }
      return canonical({
        scope: request.subcategoryId
          ? { kind: "subcategory", categoryId: category.id, subcategoryId: request.subcategoryId }
          : { kind: "category", categoryId: category.id },
        ...(cursor === undefined ? {} : { cursor }),
      });
    },
    async read(input: ReturnType<typeof canonical>): Promise<PublicAdPage> {
      const selected = z.object({
        scope: scopeSchema,
        limit: z.number().int().min(1).max(PUBLIC_AD_PAGE_SIZE),
        after: position.optional(),
      }).parse(input);
      const page = await dependencies.store.read({
        scope: selected.scope,
        limit: selected.limit,
        ...(selected.after ? { after: selected.after } : {}),
      });
      if (page.scanned > selected.limit + 1 || page.items.length > Math.min(page.scanned, selected.limit)) throw new Error("Ad read exceeded its page budget.");
      const key = JSON.stringify([selected.scope, selected.limit]);
      return {
        items: page.items,
        ...(page.hasMore && page.lastScanned
          ? { nextCursor: Buffer.from(JSON.stringify({ key, after: position.parse(page.lastScanned) })).toString("base64url") }
          : {}),
      };
    },
  };
}
