import { z } from "zod";
import { PersistenceConflict, recordKinds, type ClassifiedsPersistence, type ReceiptRecord, type RecordInput } from "./index";
import { createClassifiedsRecordCodec, encodeReceiptRecord, stableJson, type createClassifiedsArtifactIndex } from "./records";

export type TransferItem = { type: "record"; record: RecordInput } | { type: "receipt"; record: ReceiptRecord };
const codec = createClassifiedsRecordCodec();
type ArtifactIndex = ReturnType<typeof createClassifiedsArtifactIndex>;
export function parseTransferItem(value: unknown, artifactIndex: ArtifactIndex): TransferItem {
  const item = z.object({ type: z.enum(["record", "receipt"]), record: z.unknown() }).parse(value);
  if (item.type === "receipt") return { type: item.type, record: encodeReceiptRecord(item.record).record };
  const record = codec.parse(item.record);
  artifactIndex.encode(record);
  return { type: item.type, record };
}
export function transferKey(item: TransferItem): string {
  return item.type === "record"
    ? stableJson(["record", item.record.kind, item.record.namespace ?? "", item.record.id])
    : stableJson(["receipt", item.record.intent.actorId, item.record.intent.key]);
}
export function transferFingerprint(item: TransferItem): string {
  return stableJson(z.json().parse(item));
}
/** Stream snapshots outside the provider; import only into the explicitly supplied store. */
export function createClassifiedsTransfer(store: ClassifiedsPersistence, artifactIndex: ArtifactIndex) {
  async function assertUnchanged(version: number) {
    if (await store.transferVersion() !== version) throw new PersistenceConflict();
  }
  async function* exportKind(kind: RecordInput["kind"], version: number): AsyncGenerator<TransferItem> {
    let after: string | undefined;
    do {
      const page = await store.page({ kind, ...(after ? { after } : {}) });
      await assertUnchanged(version);
      for (const { version: _, ...record } of page.items) yield { type: "record", record };
      after = page.next;
    } while (after);
  }
  async function* exportReceipts(version: number): AsyncGenerator<TransferItem> {
    let after: { actorId: string; key: string } | undefined;
    while (true) {
      const rows = await store.receipts(after);
      await assertUnchanged(version);
      if (!rows.length) break;
      for (const record of rows) yield { type: "receipt", record };
      after = rows.at(-1)!.intent;
    }
  }
  async function* exportRecords(): AsyncGenerator<TransferItem> {
    const version = await store.transferVersion();
    for (const kind of recordKinds) yield* exportKind(kind, version);
    yield* exportReceipts(version);
    await assertUnchanged(version);
  }
  async function importItem(value: unknown, dryRun = true) {
    const item = parseTransferItem(value, artifactIndex);
    if (dryRun) return { key: transferKey(item), status: "valid" as const };
    const status = item.type === "record" ? await store.importRecord(item.record) : await store.importReceipt(item.record);
    return { key: transferKey(item), status };
  }
  return { exportRecords, importItem };
}
