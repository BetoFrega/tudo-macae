import { z } from "zod";
import { mediaMetadataInputSchema, mediaMetadataSchema, mediaStatuses } from "../model";
import type { DemoMediaInput, MediaCatalogDependencies, RegisterMediaInput } from "../catalog";
import { validateLegacyMediaTransitionPlans, type LegacyMediaTransitionPlan } from "../transitionPolicy";

const registerSchema = z.strictObject({
  status: z.enum(mediaStatuses), metadata: mediaMetadataInputSchema,
  storagePath: z.string().trim().min(1), mimeType: z.string().trim().min(1),
});
function mediaId(id: string) {
  const normalized = id.trim();
  if (!normalized) throw new TypeError("Informe uma Mídia válida.");
  return normalized;
}
export function buildMediaCatalog({ now, store }: MediaCatalogDependencies) {
  function record(input: RegisterMediaInput) {
    const timestamp = now();
    return { ...input.metadata, status: input.status, storagePath: input.storagePath,
      mimeType: input.mimeType, revision: 1, createdAt: timestamp, updatedAt: timestamp };
  }
  return {
    register: async (input: RegisterMediaInput) => store.create(record(registerSchema.parse(input))),
    get: async (id: string) => store.read(mediaId(id)),
    async byIds(ids: string[]) {
      if (ids.length > 50) throw new TypeError("A leitura aceita no máximo 50 Mídias por vez.");
      const normalized = ids.map(mediaId);
      const records = await Promise.all(normalized.map(id => store.read(id)));
      return records.flatMap(value => value ?? []);
    },
    listRevisions: async (id: string) => store.revisions(mediaId(id)),
    async ensureDemo(input: DemoMediaInput) {
      const id = input.id.trim();
      if (!id || !mediaStatuses.includes(input.status)) throw new TypeError("Informe uma Mídia de demonstração válida.");
      return store.ensure(id, record({ ...input, metadata: mediaMetadataSchema.parse(input.metadata) }));
    },
    transitionLegacy: async (plans: LegacyMediaTransitionPlan[]) => store.transition(validateLegacyMediaTransitionPlans(plans)),
  };
}
