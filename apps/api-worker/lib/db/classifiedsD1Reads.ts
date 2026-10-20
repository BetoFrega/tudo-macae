import { AD_SITEMAP_READ_LIMIT } from "@tudomacae/ads/publicAdSitemap";
import { PersistenceConflict, PersistenceLimit, type AdSitemapRow, type RecordKind, type RecordPage, type RecordQuery, type StoredRecord } from "@tudomacae/classifieds-persistence";
import { byteLength, persistenceLimits } from "@tudomacae/classifieds-persistence/records";
import { normalizeBusinessName } from "@tudomacae/advertiser-identity/business";
import { codec, identifier, identityScope, kindScope, pointScope, stored, type D1Statements, type Epoch, type Row } from "./classifiedsD1Statements";

type Binding = string | number;
type Filter = { where: string[]; bindings: Binding[] };
type Ordering = { descending: boolean; orderColumns: string; sort: string };
type Candidates = { sql: string; bindings: Binding[] };

const columns = "kind, namespace, id, body, version, source_version";

function pageLimit(query: RecordQuery) {
  const limit = query.limit ?? persistenceLimits.pageItems;
  if (!Number.isInteger(limit) || limit < 1 || limit > persistenceLimits.pageItems) throw new PersistenceLimit();
  return limit;
}

function assertDuplicityFilter(query: RecordQuery) {
  if ((query.contact !== undefined || query.normalizedTitle !== undefined) && query.kind !== "profile") throw new TypeError("Filtro de duplicidade exige perfil.");
  if (query.normalizedTitlePrefix !== undefined && (query.kind !== "profile" || query.order !== "title")) throw new TypeError("Prefixo de nome exige perfis em ordem de nome.");
}

function assertOrder({ order, kind }: RecordQuery) {
  if (order && !["rank", "rankDesc", "createdDesc", "title"].includes(order)) throw new TypeError("Ordem inválida.");
  if ((order === "createdDesc" && !["profile", "ad"].includes(kind))
    || (order === "title" && kind !== "profile")
    || ((order === "rank" || order === "rankDesc") && !["category", "subcategory"].includes(kind))) throw new TypeError("Ordem incompatível.");
}

function pageOrdering(order: RecordQuery["order"]): Ordering {
  const descending = order === "rankDesc" || order === "createdDesc";
  const direction = descending ? "DESC" : "ASC";
  const keys = `namespace ${direction}, id ${direction}`;
  if (order === undefined) return { descending, orderColumns: "namespace, id", sort: keys };
  // Served by the classifieds_profile_title index (kind, normalized_title, namespace, id).
  if (order === "title") return { descending, orderColumns: "normalized_title, namespace, id", sort: `normalized_title ASC, ${keys}` };
  const orderColumn = order === "createdDesc" ? "json_extract(body, '$.createdAt')" : "json_extract(body, '$.order')";
  return { descending, orderColumns: `${orderColumn}, namespace, id`, sort: `${orderColumn} ${direction}, ${keys}` };
}

const isOrderedCursor = (value: unknown[]) =>
  value.length === 3 && typeof value[0] === "number" && Number.isFinite(value[0]) && typeof value[1] === "string" && typeof value[2] === "string";
const isTitleCursor = (value: unknown[]) => value.length === 3 && value.every(item => typeof item === "string");
const isUnorderedCursor = (value: unknown[]) => value.length === 2 && value.every(item => typeof item === "string");

function parseCursor(after: string | undefined, order: RecordQuery["order"]): Binding[] | undefined {
  if (after === undefined) return undefined;
  if (byteLength(after) > 32_768) throw new PersistenceLimit();
  const value: unknown = JSON.parse(after);
  const valid = order === undefined ? isUnorderedCursor : order === "title" ? isTitleCursor : isOrderedCursor;
  if (!Array.isArray(value) || !valid(value)) throw new TypeError("Cursor inválido.");
  return value as Binding[];
}

function addCursorFilter(filter: Filter, cursor: Binding[] | undefined, ordering: Ordering) {
  if (!cursor) return;
  filter.where.push(`(${ordering.orderColumns}) ${ordering.descending ? "<" : ">"} (${cursor.map(() => "?").join(", ")})`);
  filter.bindings.push(...cursor);
}

function addColumnFilters(filter: Filter, query: RecordQuery) {
  for (const [column, value] of [
    ["profile_id", query.profileId], ["category_id", query.categoryId],
    ["owner_id", query.ownerId], ["normalized_title", query.normalizedTitle], ["slug", query.slug],
  ] as const) {
    if (value === undefined) continue;
    filter.where.push(`${column} = ?`);
    filter.bindings.push(identifier(value));
  }
}

function assertAdvertiserQuery(query: RecordQuery) {
  if (query.advertiserOwnerId === undefined) return;
  if (query.kind !== "ad" || query.ownerId !== undefined || query.profileId !== undefined) throw new TypeError("Consulta de anúncios por titular inválida.");
}

function addAdFilters(filter: Filter, query: RecordQuery) {
  if (query.subcategoryId === undefined && query.status === undefined && query.completedPublication === undefined) return;
  if (query.kind !== "ad") throw new TypeError("Filtro de anúncio inválido.");
  if (query.subcategoryId !== undefined) {
    filter.where.push("json_extract(body, '$.subcategoryId') = ?");
    filter.bindings.push(identifier(query.subcategoryId));
  }
  if (query.status !== undefined) {
    filter.where.push("json_extract(body, '$.status') = ?");
    filter.bindings.push(identifier(query.status));
  }
  if (query.completedPublication) filter.where.push("coalesce(json_extract(body, '$.publicationState'), 'published') = 'published'");
}

function addProfileFilters(filter: Filter, query: RecordQuery) {
  if (query.normalizedTitlePrefix !== undefined) {
    // Same upper bound as the Firestore catalog range, so both authorities match the same names.
    filter.where.push("normalized_title >= ? AND normalized_title <= ?");
    filter.bindings.push(identifier(query.normalizedTitlePrefix), `${query.normalizedTitlePrefix}\uf8ff`);
  }
  if (query.contact !== undefined) {
    filter.where.push("id IN (SELECT profile_id FROM classifieds_contacts WHERE contact = ?)");
    filter.bindings.push(identifier(query.contact));
  }
  if (query.claimable !== undefined) {
    if (query.kind !== "profile" || typeof query.claimable !== "boolean") throw new TypeError("Filtro de perfil inválido.");
    filter.where.push(query.claimable ? "json_extract(body, '$.claimable') = 1" : "coalesce(json_extract(body, '$.claimable'), 0) = 0");
  }
  if (query.activityArea !== undefined) {
    if (query.kind !== "profile") throw new TypeError("Área exige perfil.");
    filter.where.push("namespace = '' AND id IN (SELECT profile_id FROM classifieds_areas WHERE category_id = ? AND subcategory_id = ?)");
    filter.bindings.push(identifier(query.activityArea.categoryId), identifier(query.activityArea.subcategoryId));
  }
}

function advertiserCandidates(predicate: string, sort: string, filters: Binding[], ownerId: string, limit: number): Candidates {
  const source = `SELECT ${columns} FROM classifieds_records INDEXED BY classifieds_unassociated_owner_created
        WHERE ${predicate} AND kind = 'ad' AND owner_id = ? AND (profile_id IS NULL OR profile_id = '')
        UNION ALL
        SELECT ${columns} FROM classifieds_records INDEXED BY classifieds_profile_created
        WHERE ${predicate} AND profile_id IN (
          SELECT id FROM classifieds_records INDEXED BY classifieds_owner_created
          WHERE kind = 'profile' AND namespace = '' AND owner_id = ?
            AND coalesce(json_extract(body, '$.deleting'), 0) = 0
        )`;
  return {
    sql: `authorized AS (${source}), candidates AS (
        SELECT ${columns} FROM authorized ORDER BY ${sort} LIMIT ?
      )`,
    bindings: [...filters, ownerId, ...filters, ownerId, limit],
  };
}

function newestAdvertiserCandidates(predicate: string, sort: string, filters: Binding[], ownerId: string, limit: number): Candidates {
  const associatedColumns = columns.split(", ").map(column => `a.${column}`).join(", ");
  // The global top page is contained in the top page of each disjoint owner/profile group.
  return {
    sql: `legacy AS (
        SELECT ${columns} FROM classifieds_records INDEXED BY classifieds_unassociated_owner_created
        WHERE ${predicate} AND kind = 'ad' AND owner_id = ? AND (profile_id IS NULL OR profile_id = '')
        ORDER BY ${sort} LIMIT ?
      ), profiles AS (
        SELECT id FROM classifieds_records INDEXED BY classifieds_owner_created
        WHERE kind = 'profile' AND namespace = '' AND owner_id = ?
          AND coalesce(json_extract(body, '$.deleting'), 0) = 0
      ), associated AS (
        SELECT ${associatedColumns} FROM profiles p
        CROSS JOIN json_each((SELECT json_group_array(id) FROM (
          SELECT id FROM classifieds_records INDEXED BY classifieds_profile_created
          WHERE ${predicate} AND profile_id = p.id ORDER BY ${sort} LIMIT ?
        ))) j
        CROSS JOIN classifieds_records a
        WHERE a.kind = 'ad' AND a.namespace = '' AND a.id = j.value
      ), candidates AS (
        SELECT ${columns} FROM (SELECT * FROM legacy UNION ALL SELECT * FROM associated)
        ORDER BY ${sort} LIMIT ?
      )`,
    bindings: [...filters, ownerId, limit, ownerId, ...filters, limit, limit],
  };
}

function pageCandidates(query: RecordQuery, sort: string, filter: Filter, limit: number): Candidates {
  const predicate = filter.where.join(" AND ");
  if (query.advertiserOwnerId === undefined) {
    // normalized_title stays projected so the byte window and final order can sort by it.
    return { sql: `candidates AS (SELECT ${columns}, normalized_title FROM classifieds_records WHERE ${predicate} ORDER BY ${sort} LIMIT ?)`, bindings: [...filter.bindings, limit] };
  }
  const ownerId = identifier(query.advertiserOwnerId);
  const candidates = query.order === "createdDesc" ? newestAdvertiserCandidates : advertiserCandidates;
  return candidates(predicate, sort, filter.bindings, ownerId, limit);
}

function pageScope(query: RecordQuery) {
  if (query.advertiserOwnerId !== undefined) return JSON.stringify(["all"]);
  return query.profileId && ["profile", "ad", "catalog"].includes(query.kind) ? identityScope(query.profileId) : kindScope(query.kind);
}

// An extra empty page terminates iteration, avoiding an unguarded lookahead query.
function nextCursor(last: StoredRecord | undefined, order: RecordQuery["order"]) {
  if (!last) return {};
  const key = [last.namespace ?? "", last.id];
  if (order === undefined) return { next: JSON.stringify(key) };
  if (order === "title") return { next: JSON.stringify([normalizeBusinessName(String(last.body.title ?? "")), ...key]) };
  return { next: JSON.stringify([order === "createdDesc" ? last.body.createdAt : last.body.order, ...key]) };
}

export function createD1Reads({ sql, epochSql, batch }: D1Statements) {
  async function readPoint(kind: RecordKind, id: string, namespace = "") {
    codec.key(kind, id, namespace);
    const results = await batch([
      epochSql(pointScope(kind, id, namespace)),
      sql("SELECT kind, namespace, id, body, version, source_version FROM classifieds_records WHERE kind = ? AND namespace = ? AND id = ?", kind, namespace, id),
    ], "read");
    const row = results[1]!.results[0] as Row | undefined;
    return { version: (results[0]!.results[0] as Epoch).version, record: row ? stored(row) : null };
  }
  async function page(query: RecordQuery, expectedVersion?: number): Promise<RecordPage> {
    const limit = pageLimit(query);
    assertDuplicityFilter(query);
    assertOrder(query);
    const ordering = pageOrdering(query.order);
    const cursor = parseCursor(query.after, query.order);
    const filter: Filter = { where: ["kind = ?"], bindings: [query.kind] };
    addCursorFilter(filter, cursor, ordering);
    addColumnFilters(filter, query);
    assertAdvertiserQuery(query);
    addAdFilters(filter, query);
    addProfileFilters(filter, query);
    const candidates = pageCandidates(query, ordering.sort, filter, limit);
    const scope = pageScope(query);
    const { sort } = ordering;
    const results = await batch([
      epochSql(scope),
      sql(`WITH ${candidates.sql}, sized AS (
        SELECT *, sum(length(CAST(body AS BLOB)) + length(CAST(json_quote(id) AS BLOB)) + length(CAST(json_quote(namespace) AS BLOB))
          + length(CAST(json_quote(source_version) AS BLOB)) + 256) OVER (ORDER BY ${sort}) bytes FROM candidates
      ) SELECT kind, namespace, id, body, version, source_version FROM sized WHERE bytes <= ? ORDER BY ${sort}`, ...candidates.bindings, persistenceLimits.pageBytes),
    ], "page");
    const version = (results[0]!.results[0] as Epoch).version;
    if (expectedVersion !== undefined && expectedVersion !== version) throw new PersistenceConflict();
    const items = (results[1]!.results as Row[]).map(stored);
    return { items, scope, version, ...nextCursor(items.at(-1), query.order) };
  }
  async function adSitemap(limit: number): Promise<AdSitemapRow[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > AD_SITEMAP_READ_LIMIT) throw new PersistenceLimit();
    // INDEXED BY fails the statement instead of silently scanning every record.
    const [result] = await batch([sql(`SELECT id, slug, coalesce(json_extract(body, '$.updatedAt'), json_extract(body, '$.createdAt')) last_modified
      FROM classifieds_records INDEXED BY classifieds_status_created
      WHERE kind = 'ad' AND json_extract(body, '$.status') = 'active'
        AND coalesce(json_extract(body, '$.publicationState'), 'published') = 'published'
        AND coalesce(json_extract(body, '$.deleting'), 0) = 0
      ORDER BY json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC LIMIT ?`, limit)], "page");
    return (result!.results as { id: string; slug: unknown; last_modified: unknown }[])
      .map(row => ({ id: row.id, slug: row.slug, lastModified: row.last_modified }));
  }
  return { readPoint, page, adSitemap };
}
