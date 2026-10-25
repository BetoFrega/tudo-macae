import { PersistenceLimit, type PersistenceMetrics, type RecordKind, type StoredRecord } from "@tudomacae/editorial-persistence";
import { asBody, byteLength, createEditorialRecordCodec, parsePersistenceIdentifier, persistenceLimits } from "@tudomacae/editorial-persistence/records";

export type Row = { kind: RecordKind; namespace: string; id: string; body: string; version: string; source_version: string | null };
export type Epoch = { version: number };
export const codec = createEditorialRecordCodec();
export const identifier = parsePersistenceIdentifier;
export const pointScope = (kind: RecordKind, id: string, namespace = "") => JSON.stringify(["point", kind, namespace, id]);
export const kindScope = (kind: RecordKind) => JSON.stringify(["kind", kind]);
export const articleScope = (id: string) => JSON.stringify(["article", id]);
export const mediaScope = (id: string) => JSON.stringify(["media", id]);

class StoredEditorialDataError extends Error {
  constructor(cause: unknown) {
    super("Registro editorial armazenado é inválido.", { cause });
    this.name = "StoredEditorialDataError";
  }
}
export function stored(row: Row): StoredRecord {
  let body: StoredRecord["body"];
  try {
    body = asBody(JSON.parse(row.body));
  }
  catch (cause) { throw new StoredEditorialDataError(cause); }
  return {
    kind: row.kind, id: row.id, body, version: row.version,
    ...(row.source_version === null ? {} : { sourceVersion: row.source_version }),
    ...(row.namespace ? { namespace: row.namespace } : {}),
  };
}
/** A failed `guard` assertion: another writer changed a guarded scope before commit. */
export function isGuardConflict(error: unknown) {
  return error instanceof Error && error.message.includes("CHECK constraint failed: editorial_conflict");
}

export type D1PersistenceDependencies = {
  database: D1Database;
  /** Aggregate only: no identifiers, bodies or raw SQL in telemetry. */
  observe?(metrics: PersistenceMetrics): void | Promise<void>;
};
export type D1Statements = ReturnType<typeof createD1Statements>;

/** Statement sizes are tracked per persistence instance; create one per D1 binding. */
export function createD1Statements(dependencies: D1PersistenceDependencies) {
  const db = dependencies.database;
  const sizes = new WeakMap<D1PreparedStatement, { bytes: number; parameters: number; sqlBytes: number }>();
  function sql(statement: string, ...bindings: (string | number | null)[]) {
    if (byteLength(statement) > 100_000 || bindings.length > 100) throw new PersistenceLimit();
    const prepared = db.prepare(statement).bind(...bindings);
    sizes.set(prepared, { bytes: bindings.reduce<number>((total, value) => total + (typeof value === "string" ? byteLength(value) : 8), 0), parameters: bindings.length, sqlBytes: byteLength(statement) });
    return prepared;
  }
  const epochSql = (scope: string) => sql("SELECT coalesce((SELECT version FROM editorial_epochs WHERE scope = ?), 0) version", scope);
  async function batch(statements: D1PreparedStatement[], operation: PersistenceMetrics["operation"]) {
    if (statements.length > persistenceLimits.statements) throw new PersistenceLimit();
    const boundBytes = statements.reduce((total, statement) => total + sizes.get(statement)!.bytes, 0);
    if (boundBytes > 12_000_000) throw new PersistenceLimit();
    const start = performance.now();
    const results = await db.batch(statements);
    const metrics = {
      operation, statements: statements.length, boundBytes,
      returnedBytes: results.reduce((total, result) => total + byteLength(JSON.stringify(result.results)), 0),
      rowsRead: results.reduce((total, result) => total + result.meta.rows_read, 0),
      rowsWritten: results.reduce((total, result) => total + result.meta.rows_written, 0),
      durationMs: performance.now() - start,
      maxParameters: Math.max(0, ...statements.map(statement => sizes.get(statement)!.parameters)),
      maxSqlBytes: Math.max(0, ...statements.map(statement => sizes.get(statement)!.sqlBytes)),
    };
    // Observability failure must never turn a committed write into a failed operation.
    try {
      const pending = dependencies.observe?.(metrics);
      if (pending) void pending.catch(() => { /* The composition owns telemetry transport failures. */ });
    }
    catch { /* The composition owns telemetry transport failures. */ }
    return results;
  }
  function guard(token: string, scope: string, version: number) {
    return sql("INSERT INTO editorial_assertions VALUES (?, coalesce((SELECT version FROM editorial_epochs WHERE scope = ?), 0) = ?)", token, scope, version);
  }
  return { sql, epochSql, batch, guard };
}
