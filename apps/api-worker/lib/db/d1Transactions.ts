// Structural copies of the persistence packages' contracts, kept local so neither domain depends on the other; each adapter must stay assignable to them.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type OperationIntent = { actorId: string; key: string; operation: string; input: Json };
type RecordShape<K extends string> = { kind: K; id: string; body: { [key: string]: Json }; namespace?: string; sourceVersion?: string };
type Read<K extends string, S> = (kind: K, id: string, namespace?: string) => Promise<S | null>;
interface Transaction<K extends string, I extends RecordShape<K>, S, Q, P> {
  read: Read<K, S>;
  page(query: Q, expectedVersion?: number): Promise<P>;
  put(record: I): void;
  remove(kind: K, id: string, namespace?: string): void;
}
type Command<K extends string, I> = { kind: "put"; record: I } | { kind: "remove"; recordKind: K; id: string; namespace: string };
type Replayed<T> = { value: T; replayed: boolean };

/** Persistence-package contract the shared retry loop needs; every domain keeps its own SQL. */
export interface D1TransactionDomain<K extends string, I extends RecordShape<K>, S extends I, Q, P extends { scope: string; version: number }> {
  Conflict: new () => Error;
  Limit: new () => Error;
  limits: { reads: number; guards: number; commands: number; pageBytes: number; attempts: number };
  stableJson(value: Json): string;
  byteLength(value: string): number;
  codec: { key(kind: K, id: string, namespace?: string): unknown; parse(record: I): I };
  pointScope(kind: K, id: string, namespace?: string): string;
  readPoint(kind: K, id: string, namespace?: string): Promise<{ version: number; record: S | null }>;
  page(query: Q, expectedVersion?: number): Promise<P>;
  /** Reads each scope's current epoch, in order. */
  epochs(scopes: string[]): Promise<number[]>;
  guard(token: string, scope: string, version: number): D1PreparedStatement;
  isGuardConflict(error: unknown): boolean;
  commit(statements: D1PreparedStatement[]): Promise<unknown>;
  /** Imports preserve the stored body exactly; transactional writes may derive fields. */
  write(record: I, imported: boolean): D1PreparedStatement[];
  remove(kind: K, id: string, namespace: string): D1PreparedStatement;
  releaseAssertions(token: string): D1PreparedStatement;
  replay<T extends Json>(intent: OperationIntent): Promise<Replayed<T> | null>;
  receipt(intent: OperationIntent, result: Json): D1PreparedStatement;
}

export function createD1TransactionRunner<K extends string, I extends RecordShape<K>, S extends I, Q, P extends { scope: string; version: number }>(
  domain: D1TransactionDomain<K, I, S, Q, P>,
) {
  const { Conflict, Limit, limits, stableJson, byteLength, codec, pointScope, readPoint } = domain;
  type Tx = Transaction<K, I, S, Q, P>;
  async function unchanged(guards: Map<string, number>) {
    if (!guards.size) return true;
    const versions = await domain.epochs([...guards.keys()]);
    return [...guards.values()].every((version, index) => version === versions[index]);
  }
  /** Per-attempt read guards, read cache and buffered commands behind one `Transaction`. */
  function openAttempt() {
    const guards = new Map<string, number>();
    const reads = new Map<string, S | null>();
    const commands = new Map<string, Command<K, I>>();
    let readCalls = 0;
    let readFailed = false;
    let retainedBytes = 0;
    async function reading<T>(operation: () => Promise<T>) {
      if (++readCalls > limits.reads) throw new Limit();
      try {
        const result = await operation();
        retainedBytes += byteLength(JSON.stringify(result));
        if (retainedBytes > 4 * limits.pageBytes) throw new Limit();
        return result;
      }
      catch (error) {
        readFailed = true;
        throw error;
      }
    }
    function remember(scope: string, version: number) {
      const previous = guards.get(scope);
      if (previous !== undefined && previous !== version) throw new Conflict();
      guards.set(scope, version);
      if (guards.size > limits.guards) throw new Limit();
    }
    function command(key: string, value: Command<K, I>) {
      if (!reads.has(key)) throw new TypeError("Gravação exige leitura protegida do registro.");
      const prospective = new Map(commands).set(key, value);
      if (prospective.size > limits.commands) throw new Limit();
      const bytes = [...prospective.values()].reduce((total, item) => total + (item.kind === "put" ? byteLength(stableJson(item.record.body)) : 0), 0);
      if (bytes > 4 * limits.pageBytes) throw new Limit();
      commands.set(key, value);
    }
    const tx: Tx = {
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
        const result = await reading(() => domain.page(query, version));
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
    return intent ? domain.replay<T>(intent) : null;
  }
  /** Returns null when the decision should be retried on a fresh attempt. */
  async function decideAttempt<T extends Json>(attempt: Attempt, decide: (tx: Tx) => Promise<T>) {
    try {
      return { value: await decide(attempt.tx) };
    }
    catch (error) {
      if (attempt.readFailed() && !(error instanceof Conflict)) throw error;
      if (error instanceof Conflict || !(await unchanged(attempt.guards))) return null;
      throw error;
    }
  }
  /** Returns null when a guarded scope changed before commit and the attempt should be retried. */
  async function commitAttempt<T extends Json>(intent: OperationIntent | null, { guards, commands }: Attempt, value: T): Promise<Replayed<T> | null> {
    const token = crypto.randomUUID();
    const statements = [...guards].map(([scope, version]) => domain.guard(token, scope, version));
    for (const item of commands.values()) {
      statements.push(...(item.kind === "put" ? domain.write(item.record, false) : [domain.remove(item.recordKind, item.id, item.namespace)]));
    }
    if (intent) statements.push(domain.receipt(intent, value));
    statements.push(domain.releaseAssertions(token));
    try {
      await domain.commit(statements);
      return { value, replayed: false };
    }
    catch (error) {
      // Resolves both racing callers and an acknowledged receipt after a lost response.
      const prior = await replayed<T>(intent);
      if (prior) return prior;
      if (domain.isGuardConflict(error)) return null;
      throw error;
    }
  }
  async function transact<T extends Json>(intent: OperationIntent | null, decide: (tx: Tx) => Promise<T>) {
    for (let attempt = 0; attempt < limits.attempts; attempt++) {
      const prior = await replayed<T>(intent);
      if (prior) return prior;
      const current = openAttempt();
      const decision = await decideAttempt(current, decide);
      if (!decision) continue;
      const committed = await commitAttempt(intent, current, decision.value);
      if (committed) return committed;
    }
    throw new Conflict();
  }
  async function importRecord(input: I): Promise<"imported" | "unchanged"> {
    const record = codec.parse(input);
    for (let attempt = 0; attempt < limits.attempts; attempt++) {
      const current = await readPoint(record.kind, record.id, record.namespace);
      if (current.record) {
        if (stableJson(current.record.body) !== stableJson(record.body) || current.record.sourceVersion !== record.sourceVersion) throw new Conflict();
        return "unchanged";
      }
      const token = crypto.randomUUID();
      try {
        await domain.commit([
          domain.guard(token, pointScope(record.kind, record.id, record.namespace), current.version), ...domain.write(record, true),
          domain.releaseAssertions(token),
        ]);
        return "imported";
      }
      catch (error) {
        if (domain.isGuardConflict(error)) continue;
        throw error;
      }
    }
    throw new Conflict();
  }
  async function snapshot<T>(decide: (reader: Pick<Tx, "read">) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < limits.attempts; attempt++) {
      const guards = new Map<string, number>();
      const records = new Map<string, Promise<S | null>>();
      const reader = {
        read(kind: K, id: string, namespace = "") {
          codec.key(kind, id, namespace);
          const scope = pointScope(kind, id, namespace);
          if (!records.has(scope)) {
            if (records.size >= limits.guards) throw new Limit();
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
    throw new Conflict();
  }
  return { transact, importRecord, snapshot };
}
