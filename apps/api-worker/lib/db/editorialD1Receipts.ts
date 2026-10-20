import { IdempotencyConflict, type Json, type OperationIntent, type ReceiptRecord } from "@tudomacae/editorial-persistence";
import { encodeOperationIntent, encodeReceiptRecord, stableJson } from "@tudomacae/editorial-persistence/records";
import { identifier, type D1Statements } from "./editorialD1Statements";

export function createD1Receipts({ sql, batch }: D1Statements) {
  async function row(actorId: string, key: string) {
    const results = await batch([sql("SELECT intent, result FROM editorial_receipts WHERE actor_id = ? AND operation_key = ?", identifier(actorId), identifier(key))], "read");
    return results[0]!.results[0] as { intent: string; result: string } | undefined;
  }
  async function readReceipt(actorId: string, key: string): Promise<ReceiptRecord | null> {
    const found = await row(actorId, key);
    if (!found) return null;
    const value = JSON.parse(found.intent) as { operation: string; input: Json };
    return encodeReceiptRecord({ intent: { actorId, key, ...value }, result: JSON.parse(found.result) }).record;
  }
  async function replay<T extends Json>(intent: OperationIntent) {
    const { encoded } = encodeOperationIntent(intent);
    const found = await row(intent.actorId, intent.key);
    if (!found) return null;
    if (found.intent !== encoded) throw new IdempotencyConflict();
    return { value: JSON.parse(found.result) as T, replayed: true };
  }
  function receipt(intent: OperationIntent, result: Json) {
    const { record, encodedIntent, encodedResult } = encodeReceiptRecord({ intent, result });
    return sql("INSERT INTO editorial_receipts VALUES (?, ?, ?, ?)", record.intent.actorId, record.intent.key, encodedIntent, encodedResult);
  }
  async function importReceipt(record: ReceiptRecord): Promise<"imported" | "unchanged"> {
    record = encodeReceiptRecord(record).record;
    const existing = async () => {
      const prior = await replay(record.intent);
      if (prior && stableJson(prior.value) !== stableJson(record.result)) throw new IdempotencyConflict();
      return prior ? "unchanged" as const : null;
    };
    const before = await existing();
    if (before) return before;
    try {
      await batch([receipt(record.intent, record.result)], "commit");
      return "imported";
    }
    catch (error) {
      const after = await existing();
      if (!after) throw error;
      return after;
    }
  }
  return { readReceipt, replay, receipt, importReceipt };
}
