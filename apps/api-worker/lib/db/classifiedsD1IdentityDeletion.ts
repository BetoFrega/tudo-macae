import { PersistenceConflict, PersistenceLimit, type IdentityDeletionAudit, type IdentityManifest, type Json, type OperationIntent, type RecordInput } from "@tudomacae/classifieds-persistence";
import { byteLength, persistenceLimits, stableJson } from "@tudomacae/classifieds-persistence/records";
import { createClassifiedsDeletionPolicy } from "@tudomacae/classifieds-persistence/deletion";
import { createPhotoPathPolicy } from "@tudomacae/classifieds-photos/paths";
import { createHash } from "node:crypto";
import { identifier, identityScope, isGuardConflict, stored, type D1Statements, type Epoch, type Row } from "./classifiedsD1Statements";
import type { createD1Receipts } from "./classifiedsD1Receipts";

function profileReservations(body: RecordInput["body"], now: number) {
  const values = body.pendingImageUploadReservations;
  if (!Array.isArray(values)) return 0;
  return values.filter(value => value !== null && typeof value === "object" && !Array.isArray(value)
    && (typeof value.expiresAt !== "number" || value.expiresAt > now)).length;
}
type IdentityDeletionCommand<T extends Json> = {
  profileId: string; expectedVersion: number; now: number; intent: OperationIntent; audit: IdentityDeletionAudit; result: T; correlationId?: string; photoOperationId?: string;
};
type DeletionPlan = Awaited<ReturnType<typeof deletionPolicy.plan>>;
const photoPaths = createPhotoPathPolicy(async bytes => createHash("sha256").update(bytes).digest("hex"));
const deletionPolicy = createClassifiedsDeletionPolicy((ownerId, path) => photoPaths.owns({ ownerKind: "profile", ownerId, path }));

export function createD1IdentityDeletion(
  { sql, epochSql, batch, guard }: D1Statements,
  { encodedIntent, replay, receipt }: ReturnType<typeof createD1Receipts>,
) {
  async function manifest(profileId: string, now: number): Promise<IdentityManifest> {
    identifier(profileId);
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Data inválida.");
    const results = await batch([
      epochSql(identityScope(profileId)),
      sql("SELECT kind, namespace, id, body, version, source_version FROM classifieds_records WHERE kind = 'profile' AND namespace = '' AND id = ?", profileId),
      sql(`SELECT count(*) adCount FROM classifieds_records WHERE kind = 'ad' AND profile_id = ?`, profileId),
      sql("SELECT coalesce(json_array_length(body, '$.items'), 0) itemCount FROM classifieds_records WHERE kind = 'catalog' AND namespace = '' AND id = ?", profileId),
      sql(`SELECT count(*) imageCount,
        coalesce(sum(reserved = 1 AND linked = 0 AND (expires_at IS NULL OR expires_at > ?)), 0) activeReservations,
        coalesce(sum(ownership = 'legacy'), 0) legacyImages, coalesce(sum(ownership = 'foreign'), 0) skippedImages
        FROM classifieds_artifacts WHERE ad_id IN (SELECT id FROM classifieds_records WHERE kind = 'ad' AND profile_id = ?)`, now, profileId),
    ], "manifest");
    const profile = results[1]!.results[0] as Row | undefined;
    const artifacts = results[4]!.results[0] as Pick<IdentityManifest, "imageCount" | "activeReservations" | "legacyImages" | "skippedImages">;
    return {
      profile: profile ? stored(profile) : null, version: (results[0]!.results[0] as Epoch).version,
      adCount: (results[2]!.results[0] as { adCount: number }).adCount,
      catalogItemCount: (results[3]!.results[0] as { itemCount: number } | undefined)?.itemCount ?? 0,
      ...artifacts,
      activeReservations: artifacts.activeReservations + (profile ? profileReservations(stored(profile).body, now) : 0),
    };
  }
  function deletionStatements(input: IdentityDeletionCommand<Json>, plan: DeletionPlan, audit: IdentityDeletionAudit, token: string) {
    const operationId = createHash("sha256").update(stableJson([input.intent.actorId, input.intent.key])).digest("hex");
    const correlation = identifier(input.correlationId ?? operationId);
    const photoOperationId = identifier(input.photoOperationId ?? `${operationId}:photo`);
    return [
      guard(token, identityScope(input.profileId), input.expectedVersion),
      sql(`INSERT INTO classifieds_records (kind, id, body, version)
        SELECT 'adCleanup', a.job_id, json_patch(json_object('adId', a.ad_id, 'path', a.path, 'correlationId', ?,
          'purgeOperationId', ? || ':' || a.job_id, 'dueAt', CASE WHEN a.pending = 1 THEN ? ELSE ? END,
          'createdAt', ?, 'attempts', 0), json(CASE WHEN a.completed = 1 THEN ? ELSE '{}' END)), lower(hex(randomblob(16)))
        FROM classifieds_artifacts a JOIN classifieds_records r ON r.kind = 'ad' AND r.namespace = '' AND r.id = a.ad_id
        WHERE r.profile_id = ? AND a.ownership = 'owned'
        ON CONFLICT(kind, namespace, id) DO UPDATE SET body = json_patch(classifieds_records.body, excluded.body), version = excluded.version`,
      correlation, correlation, plan.pendingDueAt, plan.dueAt, input.now, JSON.stringify({ writerCompleted: plan.writerCompleted }), input.profileId),
      sql(`INSERT INTO classifieds_records (kind, id, body, version)
        SELECT 'photoCleanup', ?, json_object('profileId', id, 'photoPath', ?,
          'status', 'pending', 'attempts', 0, 'createdAt', ?, 'updatedAt', ?), lower(hex(randomblob(16)))
        FROM classifieds_records WHERE kind = 'profile' AND namespace = '' AND id = ? AND ? IS NOT NULL`,
      photoOperationId, plan.ownedPhotoPath ?? null, input.now, input.now, input.profileId, plan.ownedPhotoPath ?? null),
      sql("DELETE FROM classifieds_records WHERE kind = 'ad' AND profile_id = ?", input.profileId),
      sql("DELETE FROM classifieds_records WHERE kind IN ('profile','catalog') AND namespace = '' AND id = ?", input.profileId),
      sql(`INSERT INTO classifieds_records (kind, id, body, version) VALUES ('audit', ?, ?, lower(hex(randomblob(16))))`,
        operationId, stableJson({ operation: input.intent.operation, actorId: input.intent.actorId, profileId: input.profileId, correlationId: correlation, at: input.now, expiresAt: plan.auditExpiresAt, ...audit, result: input.result })),
    ];
  }
  async function commitDeletion<T extends Json>(statements: D1PreparedStatement[], deletionIntent: OperationIntent, result: T) {
    try {
      await batch(statements, "deleteIdentity");
    }
    catch (error) {
      const prior = await replay<T>(deletionIntent);
      if (prior) return prior;
      if (isGuardConflict(error)) throw new PersistenceConflict();
      throw error;
    }
    return { value: result, replayed: false };
  }
  async function deleteIdentity<T extends Json>(input: IdentityDeletionCommand<T>) {
    const audit = deletionPolicy.audit(input.audit);
    const deletionIntent = { ...input.intent, input: {
      profileId: input.profileId, expectedVersion: input.expectedVersion, requested: input.intent.input,
      correlationId: input.correlationId ?? null, photoOperationId: input.photoOperationId ?? null,
      audit,
    } };
    encodedIntent(deletionIntent);
    if (byteLength(stableJson(input.result)) > 512_000) throw new PersistenceLimit();
    const prior = await replay<T>(deletionIntent);
    if (prior) return prior;
    const current = await manifest(input.profileId, input.now);
    if (current.version !== input.expectedVersion) throw new PersistenceConflict();
    if (!current.profile) throw new TypeError("Perfil não encontrado.");
    const plan = await deletionPolicy.plan(current, input.now);
    const token = crypto.randomUUID();
    return commitDeletion([
      ...deletionStatements(input, plan, audit, token),
      receipt(deletionIntent, input.result),
      sql("DELETE FROM classifieds_assertions WHERE token = ?", token),
    ], deletionIntent, input.result);
  }
  async function expireAudits(now: number) {
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Data inválida.");
    const results = await batch([sql(`DELETE FROM classifieds_records WHERE rowid IN (
      SELECT rowid FROM classifieds_records INDEXED BY classifieds_audit_expiry WHERE kind = 'audit' AND json_extract(body, '$.expiresAt') <= ?
      ORDER BY json_extract(body, '$.expiresAt'), rowid LIMIT ?
    ) RETURNING id`, now, persistenceLimits.commands)], "expireAudits");
    return results[0]!.results.length;
  }
  return { manifest, deleteIdentity, expireAudits };
}
