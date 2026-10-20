import { PhotoError, photoByteLimit, type PhotoObjects, type PhotoRecord } from "@tudomacae/classifieds-photos";

const retired = "classifiedsRetired";
function matches(object: R2Object, record: PhotoRecord) {
  return object.customMetadata?.operationId === record.operationId && object.customMetadata.digest === record.digest;
}
function assertConfirmedRetirement(marker: R2Object, record: PhotoRecord) {
  if (!matches(marker, record) || marker.customMetadata?.originOutcome === "uncertain") throw new PhotoError("unavailable", "A retirada do arquivo exige reconciliação.");
}
function assertUnchangedSinceUpload(current: R2Object | null, record: PhotoRecord) {
  if (!current) return;
  if (!matches(current, record) || (record.generation && current.version !== record.generation)) throw new PhotoError("conflict", "O arquivo mudou antes da retirada.");
}
function retirementOutcome(current: R2Object | null, record: PhotoRecord) {
  if (current) return "removed";
  return record.generation ? "uncertain" : "never_uploaded";
}
export function createR2PhotoObjects(bucket: R2Bucket): PhotoObjects {
  return {
    async create(record, bytes) {
      const stored = await bucket.put(record.path, bytes, {
        onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: record.mimeType },
        customMetadata: { operationId: record.operationId, digest: record.digest },
      });
      if (stored) return stored.version;
      const existing = await bucket.head(record.path);
      if (existing?.customMetadata?.[retired]) throw new PhotoError("retired", "Este arquivo foi retirado.");
      if (!existing || !matches(existing, record) || existing.size !== record.size) throw new PhotoError("conflict", "O arquivo exige reconciliação.");
      return existing.version;
    },
    async head(record) {
      const object = await bucket.head(record.path);
      if (!object || object.customMetadata?.[retired]) return false;
      if (!matches(object, record) || object.version !== record.generation || object.size !== record.size) throw new PhotoError("unavailable", "O arquivo divergiu dos metadados confirmados.");
      return true;
    },
    async read(record) {
      const object = await bucket.get(record.path);
      if (!object) return null;
      if (object.customMetadata?.[retired]) return null;
      if (!matches(object, record) || object.version !== record.generation || object.size !== record.size || object.size > photoByteLimit) {
        await object.body.cancel();
        throw new PhotoError("unavailable", "O arquivo divergiu dos metadados confirmados.");
      }
      return { bytes: await object.bytes(), mimeType: record.mimeType };
    },
    async retire(record) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const current = await bucket.head(record.path);
        if (current?.customMetadata?.[retired]) {
          assertConfirmedRetirement(current, record);
          return;
        }
        assertUnchangedSinceUpload(current, record);
        const outcome = retirementOutcome(current, record);
        // The marker is permanent: R2 delete has no generation precondition and would reopen the immutable key to delayed writers.
        const marker = await bucket.put(record.path, new Uint8Array(), {
          onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" },
          customMetadata: { [retired]: "1", operationId: record.operationId, digest: record.digest, originOutcome: outcome },
          httpMetadata: { contentType: "application/octet-stream", cacheControl: "no-store" },
        });
        if (!marker) continue;
        if (outcome === "uncertain") throw new PhotoError("unavailable", "A ausência do arquivo não confirma sua retirada.");
        return;
      }
      throw new PhotoError("unavailable", "A retirada concorre com outro envio. A limpeza será repetida.");
    },
  };
}
