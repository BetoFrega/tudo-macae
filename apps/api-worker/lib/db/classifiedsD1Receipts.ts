import { IdempotencyConflict, type Json, type OperationIntent, type ReceiptRecord } from "@tudomacae/classifieds-persistence";
import { encodeOperationIntent, encodeReceiptRecord, persistenceLimits, stableJson } from "@tudomacae/classifieds-persistence/records";
import { identifier, type D1Statements } from "./classifiedsD1Statements";

export function createD1Receipts({ sql, batch }: D1Statements) {
  function encodedIntent(intent: OperationIntent) {
    return encodeOperationIntent(intent).encoded;
  }
  async function readReceipt(actorId: string, key: string): Promise<ReceiptRecord | null> {
    identifier(actorId);
    identifier(key);
    const results = await batch([sql("SELECT intent, result FROM classifieds_receipts WHERE actor_id = ? AND operation_key = ?", actorId, key)], "read");
    const row = results[0]!.results[0] as { intent: string; result: string } | undefined;
    if (!row) return null;
    const value = JSON.parse(row.intent) as { operation: string; input: Json };
    return encodeReceiptRecord({ intent: { actorId, key, ...value }, result: JSON.parse(row.result) }).record;
  }
  async function replay<T extends Json>(intent: OperationIntent) {
    const encoded = encodedIntent(intent);
    const results = await batch([sql("SELECT intent, result FROM classifieds_receipts WHERE actor_id = ? AND operation_key = ?", intent.actorId, intent.key)], "read");
    const row = results[0]!.results[0] as { intent: string; result: string } | undefined;
    if (!row) return null;
    if (row.intent !== encoded) throw new IdempotencyConflict();
    return { value: JSON.parse(row.result) as T, replayed: true };
  }
  function receipt(intent: OperationIntent, result: Json) {
    const { record, encodedIntent, encodedResult } = encodeReceiptRecord({ intent, result });
    return sql("INSERT INTO classifieds_receipts VALUES (?, ?, ?, ?)", record.intent.actorId, record.intent.key, encodedIntent, encodedResult);
  }
  async function importReceipt(record: ReceiptRecord): Promise<"imported" | "unchanged"> {
    record = encodeReceiptRecord(record).record;
    const prior = await replay(record.intent);
    if (prior) {
      if (stableJson(prior.value) !== stableJson(record.result)) throw new IdempotencyConflict();
      return "unchanged";
    }
    try {
      await batch([receipt(record.intent, record.result)], "commit");
      return "imported";
    }
    catch (error) {
      const prior = await replay(record.intent);
      if (!prior) throw error;
      if (stableJson(prior.value) !== stableJson(record.result)) throw new IdempotencyConflict();
      return "unchanged";
    }
  }
  async function receipts(after?: { actorId: string; key: string }): Promise<ReceiptRecord[]> {
    const results = await batch([sql(`WITH candidates AS (
        SELECT * FROM classifieds_receipts WHERE (actor_id, operation_key) > (?, ?) ORDER BY actor_id, operation_key LIMIT ?
      ), sized AS (
        SELECT *, sum(length(CAST(intent AS BLOB)) + length(CAST(result AS BLOB)) + 8192) OVER (ORDER BY actor_id, operation_key) bytes FROM candidates
      ) SELECT actor_id, operation_key, intent, result FROM sized WHERE bytes <= ? ORDER BY actor_id, operation_key`,
    after?.actorId ?? "", after?.key ?? "", persistenceLimits.pageItems, 2 * persistenceLimits.pageBytes)], "page");
    return (results[0]!.results as { actor_id: string; operation_key: string; intent: string; result: string }[]).map(row => ({
      intent: { actorId: row.actor_id, key: row.operation_key, ...JSON.parse(row.intent) as { operation: string; input: Json } }, result: JSON.parse(row.result) as Json,
    }));
  }
  return { encodedIntent, readReceipt, replay, receipt, importReceipt, receipts };
}
