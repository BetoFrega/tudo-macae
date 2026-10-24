import { PersistenceConflict, PersistenceLimit, type RecordInput } from "@tudomacae/classifieds-persistence";
import { byteLength, createClassifiedsArtifactIndex, persistenceLimits, stableJson } from "@tudomacae/classifieds-persistence/records";
import { isAdImagePath } from "@tudomacae/ads/imagePath";
import { adImageCleanupJobId } from "@tudomacae/ads/imageCleanupJob";
import { createD1TransactionRunner } from "./d1Transactions";
import { codec, isGuardConflict, pointScope, type D1Statements, type Epoch } from "./classifiedsD1Statements";
import type { createD1Reads } from "./classifiedsD1Reads";
import type { createD1Receipts } from "./classifiedsD1Receipts";

const artifactIndex = createClassifiedsArtifactIndex({ ownsImagePath: isAdImagePath, cleanupJobId: adImageCleanupJobId });

export function createD1Transactions(
  { sql, epochSql, batch, guard }: D1Statements,
  { readPoint, page }: ReturnType<typeof createD1Reads>,
  { replay, receipt }: ReturnType<typeof createD1Receipts>,
) {
  function write(record: RecordInput, preserveRevision: boolean): D1PreparedStatement[] {
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
  return createD1TransactionRunner({
    Conflict: PersistenceConflict, Limit: PersistenceLimit, limits: { ...persistenceLimits, reads: 32 }, stableJson, byteLength,
    codec, pointScope, readPoint, page, guard, isGuardConflict, replay, receipt, write,
    epochs: async scopes => (await batch(scopes.map(epochSql), "read")).map(result => (result.results[0] as Epoch).version),
    commit: statements => batch(statements, "commit"),
    remove: (kind, id, namespace) => sql("DELETE FROM classifieds_records WHERE kind = ? AND namespace = ? AND id = ?", kind, namespace, id),
    releaseAssertions: token => sql("DELETE FROM classifieds_assertions WHERE token = ?", token),
  });
}
