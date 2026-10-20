import { PersistenceConflict, PersistenceLimit, type Json, type OperationIntent, type RecordInput, type RecordKind, type StoredRecord, type Transaction } from "@tudomacae/classifieds-persistence";
import { byteLength, createClassifiedsArtifactIndex, persistenceLimits, stableJson } from "@tudomacae/classifieds-persistence/records";
import { isAdImagePath } from "@tudomacae/ads/imagePath";
import { adImageCleanupJobId } from "@tudomacae/ads/imageCleanupJob";
import { codec, isGuardConflict, pointScope, type D1Statements, type Epoch } from "./classifiedsD1Statements";
import type { createD1Reads } from "./classifiedsD1Reads";
import type { createD1Receipts } from "./classifiedsD1Receipts";

type Command = { kind: "put"; record: RecordInput } | { kind: "remove"; recordKind: RecordKind; id: string; namespace: string };
const artifactIndex = createClassifiedsArtifactIndex({ ownsImagePath: isAdImagePath, cleanupJobId: adImageCleanupJobId });

export function createD1Transactions(
  { sql, epochSql, batch, guard }: D1Statements,
  { readPoint, page }: ReturnType<typeof createD1Reads>,
  { encodedIntent, replay, receipt }: ReturnType<typeof createD1Receipts>,
) {
  async function unchanged(guards: Map<string, number>) {
    if (!guards.size) return true;
    const results = await batch([...guards.keys()].map(epochSql), "read");
    return [...guards.values()].every((version, index) => version === (results[index]!.results[0] as Epoch).version);
  }
  function write(record: RecordInput, preserveRevision = false): D1PreparedStatement[] {
    const value = codec.parse(record);
    const indexes = codec.indexes(value);
    const body = stableJson(value.body);
    const bodySql = value.kind === "profile" && !preserveRevision
      ? "json_set(?, '$.revision', coalesce((SELECT json_extract(body, '$.revision') FROM classifieds_records WHERE kind = 'profile' AND namespace = '' AND id = ?), 0) + 1)"
      : "?";
    const insert = sql(`INSERT INTO classifieds_records (kind, namespace, id, body, version, source_version, normalized_title)
      VALUES (?, ?, ?, ${bodySql}, lower(hex(randomblob(16))), ?, ?)
      ON CONFLICT(kind, namespace, id) DO UPDATE SET body = excluded.body, version = excluded.version,
      source_version = excluded.source_version, normalized_title = excluded.normalized_title`,
    value.kind, value.namespace ?? "", value.id, body, ...(value.kind === "profile" && !preserveRevision ? [value.id] : []), value.sourceVersion ?? null, indexes.title);
    const statements = [insert];
    if (value.kind === "profile") statements.push(
      sql("DELETE FROM classifieds_contacts WHERE profile_id = ?", value.id),
      sql("INSERT INTO classifieds_contacts SELECT ?, value FROM json_each(?)", value.id, JSON.stringify(indexes.contacts)),
    );
    if (value.kind === "ad") {
      const artifacts = artifactIndex.encode(value);
      statements.push(
        sql("DELETE FROM classifieds_artifacts WHERE ad_id = ?", value.id),
        sql(`INSERT INTO classifieds_artifacts SELECT ?, json_extract(value, '$.path'), json_extract(value, '$.jobId'),
          json_extract(value, '$.linked'), json_extract(value, '$.pending'), json_extract(value, '$.completed'),
          json_extract(value, '$.reserved'), json_extract(value, '$.expiresAt'), json_extract(value, '$.ownership') FROM json_each(?)`, value.id, artifacts),
      );
    }
    return statements;
  }
  /** Per-attempt read guards, read cache and buffered commands behind one `Transaction`. */
  function openAttempt() {
    const guards = new Map<string, number>();
    const reads = new Map<string, StoredRecord | null>();
    const commands = new Map<string, Command>();
    let readCalls = 0;
    let readFailed = false;
    let retainedBytes = 0;
    async function reading<T>(operation: () => Promise<T>) {
      if (++readCalls > 32) throw new PersistenceLimit();
      try {
        const result = await operation();
        retainedBytes += byteLength(JSON.stringify(result));
        if (retainedBytes > 4 * persistenceLimits.pageBytes) throw new PersistenceLimit();
        return result;
      }
      catch (error) {
        readFailed = true;
        throw error;
      }
    }
    function remember(scope: string, version: number) {
      const previous = guards.get(scope);
      if (previous !== undefined && previous !== version) throw new PersistenceConflict();
      guards.set(scope, version);
      if (guards.size > persistenceLimits.guards) throw new PersistenceLimit();
    }
    function command(key: string, value: Command) {
      if (!reads.has(key)) throw new TypeError("Gravação exige leitura protegida do registro.");
      const prospective = new Map(commands).set(key, value);
      if (prospective.size > persistenceLimits.commands) throw new PersistenceLimit();
      const bytes = [...prospective.values()].reduce((total, command) => total + (command.kind === "put" ? byteLength(stableJson(command.record.body)) : 0), 0);
      if (bytes > 4 * persistenceLimits.pageBytes) throw new PersistenceLimit();
      commands.set(key, value);
    }
    const tx: Transaction = {
      async read(kind, id, namespace) {
        codec.key(kind, id, namespace);
        const scope = pointScope(kind, id, namespace);
        if (reads.has(scope)) return reads.get(scope)!;
        const result = await reading(() => readPoint(kind, id, namespace));
        remember(scope, result.version);
        reads.set(scope, result.record);
        return result.record;
      },
      async page(query, version) {
        const result = await reading(() => page(query, version));
        remember(result.scope, result.version);
        return result;
      },
      put(record) {
        const parsed = codec.parse(record);
        command(pointScope(parsed.kind, parsed.id, parsed.namespace), { kind: "put", record: parsed });
      },
      remove(kind, id, namespace = "") {
        codec.key(kind, id, namespace);
        command(pointScope(kind, id, namespace), { kind: "remove", recordKind: kind, id, namespace });
      },
    };
    return { tx, guards, commands, readFailed: () => readFailed };
  }
  type Attempt = ReturnType<typeof openAttempt>;
  async function replayed<T extends Json>(intent: OperationIntent | null) {
    return intent ? replay<T>(intent) : null;
  }
  /** Returns null when the decision should be retried on a fresh attempt. */
  async function decideAttempt<T extends Json>(attempt: Attempt, decide: (tx: Transaction) => Promise<T>) {
    try {
      return { value: await decide(attempt.tx) };
    }
    catch (error) {
      if (attempt.readFailed() && !(error instanceof PersistenceConflict)) throw error;
      if (error instanceof PersistenceConflict || !(await unchanged(attempt.guards))) return null;
      throw error;
    }
  }
  function commandStatements(command: Command) {
    if (command.kind === "put") return write(command.record);
    return [sql("DELETE FROM classifieds_records WHERE kind = ? AND namespace = ? AND id = ?", command.recordKind, command.namespace, command.id)];
  }
  /** Returns null when a guarded scope changed before commit and the attempt should be retried. */
  async function commitAttempt<T extends Json>(intent: OperationIntent | null, { guards, commands }: Attempt, value: T) {
    const token = crypto.randomUUID();
    const statements = [...guards].map(([scope, version]) => guard(token, scope, version));
    for (const command of commands.values()) statements.push(...commandStatements(command));
    if (intent) statements.push(receipt(intent, value));
    statements.push(sql("DELETE FROM classifieds_assertions WHERE token = ?", token));
    try {
      await batch(statements, "commit");
      return { value, replayed: false };
    }
    catch (error) {
      // Resolves both racing callers and an acknowledged receipt after a lost response.
      const prior = await replayed<T>(intent);
      if (prior) return prior;
      if (isGuardConflict(error)) return null;
      throw error;
    }
  }
  async function transact<T extends Json>(intent: OperationIntent | null, decide: (tx: Transaction) => Promise<T>) {
    if (intent) encodedIntent(intent);
    for (let attempt = 0; attempt < persistenceLimits.attempts; attempt++) {
      const prior = await replayed<T>(intent);
      if (prior) return prior;
      const current = openAttempt();
      const decision = await decideAttempt(current, decide);
      if (!decision) continue;
      const committed = await commitAttempt(intent, current, decision.value);
      if (committed) return committed;
    }
    throw new PersistenceConflict();
  }
  async function importRecord(input: RecordInput): Promise<"imported" | "unchanged"> {
    const record = codec.parse(input);
    for (let attempt = 0; attempt < persistenceLimits.attempts; attempt++) {
      const current = await readPoint(record.kind, record.id, record.namespace);
      if (current.record) {
        if (stableJson(current.record.body) !== stableJson(record.body) || current.record.sourceVersion !== record.sourceVersion) throw new PersistenceConflict();
        return "unchanged";
      }
      const token = crypto.randomUUID();
      try {
        await batch([
          guard(token, pointScope(record.kind, record.id, record.namespace), current.version), ...write(record, true),
          sql("DELETE FROM classifieds_assertions WHERE token = ?", token),
        ], "commit");
        return "imported";
      }
      catch (error) {
        if (isGuardConflict(error)) continue;
        throw error;
      }
    }
    throw new PersistenceConflict();
  }
  async function snapshot<T>(decide: (reader: Pick<Transaction, "read">) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < persistenceLimits.attempts; attempt++) {
      const guards = new Map<string, number>();
      const records = new Map<string, Promise<StoredRecord | null>>();
      const reader = {
        read(kind: RecordKind, id: string, namespace = "") {
          const scope = pointScope(kind, id, namespace);
          if (!records.has(scope)) {
            if (records.size >= persistenceLimits.guards) throw new PersistenceLimit();
            records.set(scope, readPoint(kind, id, namespace).then((value) => {
              guards.set(scope, value.version);
              return value.record;
            }));
          }
          return records.get(scope)!;
        },
      };
      let result: { value: T } | undefined;
      let failure: { error: unknown } | undefined;
      try {
        result = { value: await decide(reader) };
      }
      catch (error) { failure = { error }; }
      // Point epochs include absence and ABA; unrelated writers do not invalidate them.
      if (!await unchanged(guards)) continue;
      if (failure) throw failure.error;
      return result!.value;
    }
    throw new PersistenceConflict();
  }
  return { transact, importRecord, snapshot };
}
