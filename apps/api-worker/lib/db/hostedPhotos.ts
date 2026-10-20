import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { asBody } from "@tudomacae/classifieds-persistence/records";
import { PhotoError, PhotoObjectUnavailable, type PhotoRecord, type PhotoObjectJournal } from "@tudomacae/classifieds-photos";
import { z } from "zod";

const namespace = "classifieds_hosted_photos";
const schema = z.object({
  operationId: z.uuid(), digest: z.string(), status: z.enum(["pending", "retiring", "retired"]),
  id: z.string().min(1).optional(), uploadURL: z.url().optional(), expiresAt: z.number().optional(),
  claimToken: z.uuid().optional(), claimUntil: z.number().optional(),
});
function parse(body: unknown, record: PhotoRecord) {
  const value = schema.safeParse(body);
  if (!value.success) throw new PhotoObjectUnavailable("journal", record.operationId);
  if (value.data.operationId !== record.operationId || value.data.digest !== record.digest) throw new PhotoError("conflict", "Esta reserva já identifica outra foto.");
  return value.data;
}
export function createD1HostedPhotoJournal(persistence: ClassifiedsPersistence): PhotoObjectJournal {
  return {
    async read(record) {
      const stored = await persistence.read("retirement", record.path, namespace);
      return stored ? parse(stored.body, record) : null;
    },
    async change(record, decide) {
      const result = await persistence.transact(null, async (tx) => {
        const stored = await tx.read("retirement", record.path, namespace);
        const next = decide(stored ? parse(stored.body, record) : null);
        const body = asBody(JSON.parse(JSON.stringify(next)));
        tx.put({ kind: "retirement", id: record.path, namespace, body });
        return body;
      });
      return parse(result.value, record);
    },
  };
}
