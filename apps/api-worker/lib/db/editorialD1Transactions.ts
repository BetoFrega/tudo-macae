import { PersistenceConflict, PersistenceLimit, type Json, type OperationIntent, type RecordInput, type RecordKind, type StoredRecord, type Transaction } from "@tudomacae/editorial-persistence";
import { byteLength, persistenceLimits, stableJson } from "@tudomacae/editorial-persistence/records";
import { codec, isGuardConflict, pointScope, type D1Statements, type Epoch } from "./editorialD1Statements";
import type { createD1Reads } from "./editorialD1Reads";
import type { createD1Receipts } from "./editorialD1Receipts";

type Command = { kind: "put"; record: RecordInput } | { kind: "remove"; recordKind: RecordKind; id: string; namespace: string };

export function createD1Transactions(
  { sql, epochSql, batch, guard }: D1Statements,
  { readPoint, page }: ReturnType<typeof createD1Reads>,
  { replay, receipt }: ReturnType<typeof createD1Receipts>,
) {
  async function unchanged(guards: Map<string, number>) {
    if (!guards.size) return true;
    const results = await batch([...guards.keys()].map(epochSql), "read");
    return [...guards.values()].every((version, index) => version === (results[index]!.results[0] as Epoch).version);
  }
  function write(record: RecordInput) {
    return sql(`INSERT INTO editorial_records (kind, namespace, id, body, version, source_version)
      VALUES (?, ?, ?, ?, lower(hex(randomblob(16))), ?)
      ON CONFLICT(kind, namespace, id) DO UPDATE SET body = excluded.body, version = excluded.version, source_version = excluded.source_version`,
    record.kind, record.namespace ?? "", record.id, stableJson(record.body), record.sourceVersion ?? null);
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
      if (++readCalls > persistenceLimits.reads) throw new PersistenceLimit();
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
      const bytes = [...prospective.values()].reduce((total, item) => total + (item.kind === "put" ? byteLength(stableJson(item.record.body)) : 0), 0);
      if (bytes > 4 * persistenceLimits.pageBytes) throw new PersistenceLimit();
      commands.set(key, value);
    }
    const tx: Transaction = {
      async read(kind, id, namespace = "") {
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
  /** Returns null when a guarded scope changed before commit and the attempt should be retried. */
  async function commitAttempt<T extends Json>(intent: OperationIntent | null, { guards, commands }: Attempt, value: T) {
    const token = crypto.randomUUID();
    const statements = [...guards].map(([scope, version]) => guard(token, scope, version));
    for (const item of commands.values()) {
      statements.push(item.kind === "put"
        ? write(item.record)
        : sql("DELETE FROM editorial_records WHERE kind = ? AND namespace = ? AND id = ?", item.recordKind, item.namespace, item.id));
    }
    if (intent) statements.push(receipt(intent, value));
    statements.push(sql("DELETE FROM editorial_assertions WHERE token = ?", token));
    try {
      await batch(statements, "commit");
      return { value, replayed: false };
    }
    catch (error) {
      // Resolves both racing callers and an acknowledged receipt after a lost response.
      const prior = intent ? await replay<T>(intent) : null;
      if (prior) return prior;
      if (isGuardConflict(error)) return null;
      throw error;
    }
  }
  async function transact<T extends Json>(intent: OperationIntent | null, decide: (tx: Transaction) => Promise<T>) {
    for (let attempt = 0; attempt < persistenceLimits.attempts; attempt++) {
      const prior = intent ? await replay<T>(intent) : null;
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
          guard(token, pointScope(record.kind, record.id, record.namespace), current.version), write(record),
          sql("DELETE FROM editorial_assertions WHERE token = ?", token),
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
          codec.key(kind, id, namespace);
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
