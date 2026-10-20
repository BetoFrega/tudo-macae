import { createPublicationDrafts, type PublicationDraftStore, type PublicationRecord, type PublicationProfileRecord } from "../publicationDrafts";

export function setup(
  records: PublicationRecord[] = [],
  profiles: Record<string, string | PublicationProfileRecord> = {},
  options: { identityTypes?: boolean } = {},
) {
  const publications = new Map(records.map(record => [record.id, structuredClone(record)]));
  const profileRecords = new Map<string, PublicationProfileRecord & { identityType?: string }>(Object.entries(profiles).map(
    ([id, profile]) => [id, typeof profile === "string" ? { userId: profile } : profile],
  ));
  const store: PublicationDraftStore = {
    async read(id) { return publications.get(id) ?? null; },
    async list(userId) { return [...publications.values()].filter(record => record.userId === userId); },
    async transact(id, decide) {
      let pending: PublicationRecord | null | undefined;
      let pendingProfile: { id: string; data: PublicationProfileRecord } | undefined;
      const result = await decide({
        async read() { return publications.get(id) ?? null; },
        async readProfile(profileId) { return profileRecords.get(profileId) ?? null; },
        ...(options.identityTypes === false
          ? {}
          : {
              async personalProfileOf(userId: string) {
                return [...profileRecords].find(([, profile]) => profile.userId === userId && profile.identityType === "personal")?.[0] ?? null;
              },
            }),
        saveProfile(profileId, profile) {
          const record = publications.get(id);
          if (!record) throw new Error("Missing publication");
          pending = { ...record, advertiserProfileId: profileId };
          pendingProfile = { id: profileId, data: { ...profileRecords.get(profileId), ...profile } };
        },
        save(record) { pending = structuredClone(record); },
        updatePublication(fields) { pending = { ...publications.get(id)!, ...fields }; },
        deletePublication() { pending = null; },
      });
      if (pending) publications.set(id, pending);
      if (pending === null) publications.delete(id);
      if (pendingProfile) profileRecords.set(pendingProfile.id, pendingProfile.data);
      return result;
    },
  };
  const drafts = createPublicationDrafts({ store, now: () => 1000 });
  return Object.assign(drafts, { profile: (id: string) => profileRecords.get(id) });
}
export const input = { id: "draft", title: " Bicicleta azul ", text: "Bicicleta em bom estado", categoryId: "bikes", subcategoryId: "used" };

export const stored: PublicationRecord = { ...input, userId: "owner", title: "Bicicleta azul", createdAt: 50, status: "paused", slug: "bicicleta-azul", images: [], publicationState: "pending" };
