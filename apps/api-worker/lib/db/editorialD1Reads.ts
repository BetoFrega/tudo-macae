import { PersistenceConflict, PersistenceLimit, type RecordKind, type RecordPage, type RecordQuery, type StoredRecord } from "@tudomacae/editorial-persistence";
import { byteLength, persistenceLimits } from "@tudomacae/editorial-persistence/records";
import { articleScope, codec, identifier, kindScope, mediaScope, pointScope, stored, type D1Statements, type Epoch, type Row } from "./editorialD1Statements";

type Binding = string | number;
type Filter = { where: string[]; bindings: Binding[] };
type Order = NonNullable<RecordQuery["order"]>;

const columns = "kind, namespace, id, body, version, source_version";
/** Column, direction and the kinds whose stored shape guarantees a non-null value for it. */
const orders: Record<Order, { column: string; descending: boolean; kinds: readonly RecordKind[] }> = {
  createdDesc: { column: "created_at", descending: true, kinds: ["article", "media"] },
  publishedDesc: { column: "published_at", descending: true, kinds: ["article"] },
  revision: { column: "revision", descending: false, kinds: ["mediaRevision"] },
  cleanupAt: { column: "cleanup_at", descending: false, kinds: ["uploadReservation"] },
};

function only(condition: boolean, message: string) {
  if (!condition) throw new TypeError(message);
}
function epochBound(value: number) {
  only(Number.isSafeInteger(value) && value >= 0, "Instante inválido.");
  return value;
}

/** Kinds each optional filter applies to. */
const filterKinds: Record<"articleId" | "mediaId" | "namespace" | "status" | "mediaKind", readonly RecordKind[]> = {
  articleId: ["publicationGrant", "publicationReceipt"],
  mediaId: ["publicationGrant", "article"],
  namespace: ["mediaRevision", "legacy"],
  status: ["article", "media"],
  mediaKind: ["media"],
};

function validate(query: RecordQuery) {
  const limit = query.limit ?? persistenceLimits.pageItems;
  if (!Number.isInteger(limit) || limit < 1 || limit > persistenceLimits.pageItems) throw new PersistenceLimit();
  if (query.order) only(orders[query.order]?.kinds.includes(query.kind) ?? false, "Ordem incompatível.");
  for (const [field, kinds] of Object.entries(filterKinds)) {
    if (query[field as keyof typeof filterKinds] !== undefined) only(kinds.includes(query.kind), "Filtro incompatível com o tipo.");
  }
  only((query.publishedAtOrBefore !== undefined) === (query.order === "publishedDesc"), "Publicação exige limite e ordem juntos.");
  only((query.cleanupDueBy !== undefined) === (query.order === "cleanupAt"), "Limpeza exige prazo e ordem juntos.");
  return limit;
}

function filters(query: RecordQuery): Filter {
  const filter: Filter = { where: ["kind = ?"], bindings: [query.kind] };
  const add = (clause: string, value: Binding) => {
    filter.where.push(clause);
    filter.bindings.push(value);
  };
  if (query.articleId !== undefined) add("article_id = ?", identifier(query.articleId));
  if (query.mediaId !== undefined) {
    if (query.kind === "article") add("namespace = '' AND id IN (SELECT article_id FROM editorial_article_media WHERE media_id = ?)", identifier(query.mediaId));
    else add("media_id = ?", identifier(query.mediaId));
  }
  if (query.namespace !== undefined) add("namespace = ?", codec.key(query.kind, "scope", query.namespace).namespace);
  if (query.status !== undefined) add("status = ?", identifier(query.status));
  if (query.mediaKind !== undefined) add("media_kind = ?", identifier(query.mediaKind));
  if (query.publishedAtOrBefore !== undefined) add("published_at <= ?", epochBound(query.publishedAtOrBefore));
  if (query.cleanupDueBy !== undefined) add("cleanup_at <= ?", epochBound(query.cleanupDueBy));
  return filter;
}

function parseCursor(after: string | undefined, ordered: boolean): Binding[] | undefined {
  if (after === undefined) return undefined;
  if (byteLength(after) > 32_768) throw new PersistenceLimit();
  const value: unknown = JSON.parse(after);
  const keys = ordered ? 3 : 2;
  only(Array.isArray(value) && value.length === keys
    && (!ordered || (typeof value[0] === "number" && Number.isFinite(value[0])))
    && value.slice(ordered ? 1 : 0).every(item => typeof item === "string"), "Cursor inválido.");
  return value as Binding[];
}

function pageScope(query: RecordQuery) {
  if (query.articleId !== undefined) return articleScope(query.articleId);
  if (query.mediaId !== undefined) return mediaScope(query.mediaId);
  if (query.kind === "mediaRevision" && query.namespace !== undefined) return mediaScope(query.namespace);
  return kindScope(query.kind);
}

const orderValue: Record<Order, (record: StoredRecord) => unknown> = {
  createdDesc: record => record.body.createdAt,
  publishedDesc: record => record.body.publishedAt,
  revision: record => record.body.revision,
  cleanupAt: record => record.body.cleanupAt,
};

// An extra empty page terminates iteration, avoiding an unguarded lookahead query.
function nextCursor(last: StoredRecord | undefined, order: RecordQuery["order"]) {
  if (!last) return {};
  const key = [last.namespace ?? "", last.id];
  return { next: JSON.stringify(order ? [orderValue[order](last), ...key] : key) };
}

type OrderSpec = (typeof orders)[Order] | undefined;

function addCursor(filter: Filter, after: string | undefined, order: OrderSpec) {
  const cursor = parseCursor(after, order !== undefined);
  if (!cursor) return;
  const keyColumns = order ? `${order.column}, namespace, id` : "namespace, id";
  filter.where.push(`(${keyColumns}) ${order?.descending ? "<" : ">"} (${cursor.map(() => "?").join(", ")})`);
  filter.bindings.push(...cursor);
}

function ordering(query: RecordQuery) {
  const order: OrderSpec = query.order ? orders[query.order] : undefined;
  const direction = order?.descending ? "DESC" : "ASC";
  const keys = `namespace ${direction}, id ${direction}`;
  const filter = filters(query);
  addCursor(filter, query.after, order);
  if (!order) return { filter, sortKey: "NULL", sort: keys, outerSort: keys };
  return { filter, sortKey: order.column, sort: `${order.column} ${direction}, ${keys}`, outerSort: `sort_key ${direction}, ${keys}` };
}

export function createD1Reads({ sql, epochSql, batch }: D1Statements) {
  async function readPoint(kind: RecordKind, id: string, namespace = "") {
    codec.key(kind, id, namespace);
    const results = await batch([
      epochSql(pointScope(kind, id, namespace)),
      sql(`SELECT ${columns} FROM editorial_records WHERE kind = ? AND namespace = ? AND id = ?`, kind, namespace, id),
    ], "read");
    const row = results[1]!.results[0] as Row | undefined;
    return { version: (results[0]!.results[0] as Epoch).version, record: row ? stored(row) : null };
  }
  async function page(query: RecordQuery, expectedVersion?: number): Promise<RecordPage> {
    const limit = validate(query);
    const { sort, outerSort, sortKey, filter } = ordering(query);
    const scope = pageScope(query);
    const results = await batch([
      epochSql(scope),
      sql(`WITH candidates AS (
        SELECT ${columns}, ${sortKey} sort_key FROM editorial_records WHERE ${filter.where.join(" AND ")} ORDER BY ${sort} LIMIT ?
      ), sized AS (
        SELECT *, sum(length(CAST(body AS BLOB)) + length(CAST(json_quote(id) AS BLOB)) + length(CAST(json_quote(namespace) AS BLOB))
          + length(CAST(json_quote(source_version) AS BLOB)) + 256) OVER (ORDER BY ${outerSort}) bytes FROM candidates
      ) SELECT ${columns} FROM sized WHERE bytes <= ? ORDER BY ${outerSort}`, ...filter.bindings, limit, persistenceLimits.pageBytes),
    ], "page");
    const version = (results[0]!.results[0] as Epoch).version;
    if (expectedVersion !== undefined && expectedVersion !== version) throw new PersistenceConflict();
    const items = (results[1]!.results as Row[]).map(stored);
    return { items, scope, version, ...nextCursor(items.at(-1), query.order) };
  }
  return { readPoint, page };
}
