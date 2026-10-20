import { createPhotoLifecycle, PhotoError, type PhotoDependencies, type PhotoOwner, type PhotoRecord, type PhotoStore, type PhotoUploadQuota } from "../index";

export function fixture() {
  let now = 1_800_000_000_000;
  const owners = new Map<string, PhotoOwner>();
  const records = new Map<string, PhotoRecord>();
  const quotas = new Map<string | null, PhotoUploadQuota>();
  const bytes = new Map<string, { generation: string; bytes: Uint8Array }>();
  const markers = new Set<string>();
  const jobs: { kind: "adCleanup"; id: string; path: string }[] = [];
  const events: Parameters<PhotoDependencies["observe"]>[0][] = [];
  const store: PhotoStore = {
    async read(decide) {
      const snapshotOwners = new Map(owners);
      const snapshotRecords = new Map(records);
      return decide({ owner: async (kind, id) => snapshotOwners.get(`${kind}:${id}`) ?? null, photo: async path => snapshotRecords.get(path) ?? null });
    },
    async transact(decide) {
      const pendingOwners = new Map(owners);
      const pendingRecords = new Map(records);
      const pendingQuotas = new Map(quotas);
      const result = await decide({
        quota: async accountId => pendingQuotas.get(accountId) ?? { uploads: [] },
        saveQuota: (accountId, quota) => { pendingQuotas.set(accountId, quota); },
        owner: async (kind, id) => pendingOwners.get(`${kind}:${id}`) ?? null,
        photo: async path => pendingRecords.get(path) ?? null,
        saveOwner: (owner) => { pendingOwners.set(`${owner.kind}:${owner.id}`, owner); },
        savePhoto: (record) => { pendingRecords.set(record.path, record); },
      });
      owners.clear();
      records.clear();
      quotas.clear();
      for (const [key, value] of pendingOwners) owners.set(key, value);
      for (const [key, value] of pendingRecords) records.set(key, value);
      for (const [key, value] of pendingQuotas) quotas.set(key, value);
      return result;
    },
    due: async (time, limit) => [...records.values()].filter(record => ["reserved", "retiring"].includes(record.status) && record.retryAt <= time && (record.claimUntil ?? 0) <= time).slice(0, limit),
    deletions: async () => [...jobs],
    deferDeletion: async () => {},
    completeDeletion: async (_kind, id) => { jobs.splice(jobs.findIndex(item => item.id === id), 1); },
  };
  const dependencies: PhotoDependencies = {
    decode: async () => ({ mimeType: "image/png", width: 1, height: 1 }),
    store, now: () => now, newId: () => crypto.randomUUID(), digest: async input => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(input)))].map(byte => byte.toString(16).padStart(2, "0")).join(""),
    objects: {
      async create(record, input) {
        if (markers.has(record.path)) throw new PhotoError("retired", "retired");
        const previous = bytes.get(record.path);
        if (previous) return previous.generation;
        const generation = crypto.randomUUID();
        bytes.set(record.path, { generation, bytes: input });
        return generation;
      },
      head: async record => bytes.has(record.path),
      read: async record => bytes.has(record.path) ? { bytes: bytes.get(record.path)!.bytes, mimeType: record.mimeType } : null,
      retire: async (record) => {
        bytes.delete(record.path);
        markers.add(record.path);
      },
    },
    purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: (event) => { events.push(event); },
  };
  function owner(kind: "ad" | "profile", id: string = kind) {
    const value: PhotoOwner = { id, kind, userId: "owner", revision: 1, images: [], reservations: [], publicationState: kind === "ad" ? "pending" : undefined };
    owners.set(`${kind}:${id}`, value);
    return value;
  }
  return { dependencies, lifecycle: createPhotoLifecycle(dependencies), owners, records, quotas, bytes, markers, events, jobs, owner, advance: (ms: number) => {
    now += ms;
  } };
}
export const actor = { uid: "owner", admin: false };
export const upload = (ownerKind: "ad" | "profile" = "ad") => ({ ownerKind, ownerId: ownerKind, operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png" as const, bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), title: "Foto", description: "" });
