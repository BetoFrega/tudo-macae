import { PhotoError, photoByteLimit, photoLeaseMs, type PhotoDelivery, type PhotoObjects, type PhotoRecord } from "./contracts";

export type PhotoObjectReservation = {
  operationId: string; digest: string; status: "pending" | "retiring" | "retired";
  id?: string | undefined; uploadURL?: string | undefined; expiresAt?: number | undefined; claimToken?: string | undefined; claimUntil?: number | undefined;
};
/** What the reservation engine reads from a record; other surfaces reserve objects with records of their own. */
export type ReservedObjectRecord = Pick<PhotoRecord, "operationId" | "digest" | "size" | "mimeType" | "generation">;
export interface ReservedObjects<R extends ReservedObjectRecord = PhotoRecord> {
  create(record: R, bytes: Uint8Array): Promise<string>;
  head(record: R): Promise<boolean>;
  read(record: R): ReturnType<PhotoObjects["read"]>;
  deliver?: (record: R, delivery: PhotoDelivery, probe?: boolean) => ReturnType<NonNullable<PhotoObjects["deliver"]>>;
  retire(record: R): Promise<void>;
}
export interface PhotoObjectJournal<R extends ReservedObjectRecord = PhotoRecord> {
  read(record: R): Promise<PhotoObjectReservation | null>;
  change(record: R, decide: (prior: PhotoObjectReservation | null) => PhotoObjectReservation): Promise<PhotoObjectReservation>;
}
export interface ReservedPhotoProvider<R extends ReservedObjectRecord = PhotoRecord> {
  allocate(record: R): Promise<{ id: string; uploadURL: string }>;
  upload(record: R, reservation: PhotoObjectReservation, bytes: Uint8Array): Promise<void>;
  read(record: R, id: string): ReturnType<PhotoObjects["read"]>;
  head(record: R, id: string): Promise<boolean>;
  deliver?: (record: R, id: string, delivery: PhotoDelivery, probe?: boolean) => ReturnType<NonNullable<PhotoObjects["deliver"]>>;
  delete(id: string): Promise<unknown>;
  exists(id: string): Promise<boolean>;
}
export type PhotoObjectFailurePhase = "journal" | "allocation" | "upload" | "verification" | "deletion";
export class PhotoObjectUnavailable extends PhotoError {
  constructor(readonly phase: PhotoObjectFailurePhase, readonly operationId: string) {
    super("unavailable", "A operação da foto exige reconciliação. Tente novamente.");
  }
}
const reservationConflict = () => new PhotoError("conflict", "Aguarde o envio em andamento ou releia a foto antes de tentar novamente.");
export function createReservedPhotoObjects<R extends ReservedObjectRecord = PhotoRecord>(input: {
  provider: ReservedPhotoProvider<R>; journal: PhotoObjectJournal<R>;
  now(): number; newId(): string; digest(bytes: Uint8Array): Promise<string>;
}): ReservedObjects<R> {
  const journal: PhotoObjectJournal<R> = {
    read: record => run("journal", record, () => input.journal.read(record)),
    change: (record, decide) => run("journal", record, () => input.journal.change(record, decide)),
  };
  async function lookup(record: R) {
    const reservation = await run("journal", record, () => journal.read(record));
    if (!reservation || reservation.status !== "pending" || !reservation.id) return null;
    if (record.generation && record.generation !== reservation.id) throw reservationConflict();
    return reservation;
  }
  async function run<T>(phase: PhotoObjectFailurePhase, record: R, effect: () => Promise<T>): Promise<T> {
    try {
      return await effect();
    }
    catch (error) {
      if (error instanceof PhotoError) throw error;
      // Provider errors can contain the credential-bearing upload URL.
      throw new PhotoObjectUnavailable(phase, record.operationId);
    }
  }
  const verify = (record: R, id: string) => run("verification", record, () => input.provider.read(record, id));
  function assertHeld(prior: PhotoObjectReservation | null, token: string): asserts prior is PhotoObjectReservation {
    if (!prior || prior.status !== "pending" || prior.claimToken !== token || (prior.claimUntil ?? 0) <= input.now()) throw reservationConflict();
  }
  // A lost response does not establish that the provider stopped accepting bytes.
  const extendedClaim = (prior: PhotoObjectReservation) => ({ ...prior, claimUntil: Math.max(prior.expiresAt ?? 0, input.now()) + photoLeaseMs });
  async function assertReservedBytes(record: R, bytes: Uint8Array) {
    const size = bytes.byteLength;
    if (size < 1 || size > photoByteLimit || size !== record.size || (await input.digest(bytes)) !== record.digest) throw new PhotoError("invalid", "O arquivo divergiu da reserva.");
  }
  function claim(record: R, token: string) {
    return journal.change(record, (prior) => {
      if (prior && prior.status !== "pending") throw new PhotoError("retired", "Esta foto foi retirada.");
      if ((prior?.claimUntil ?? 0) > input.now()) throw reservationConflict();
      return { ...prior, operationId: record.operationId, digest: record.digest, status: "pending", claimToken: token, claimUntil: input.now() + photoLeaseMs };
    });
  }
  async function ensureAllocated(record: R, reservation: PhotoObjectReservation, token: string) {
    if (reservation.id) return reservation;
    const expiresAt = input.now() + photoLeaseMs;
    const allocated = await run("allocation", record, () => input.provider.allocate(record));
    try {
      return await journal.change(record, (prior) => {
        assertHeld(prior, token);
        return { ...prior, id: allocated.id, uploadURL: allocated.uploadURL, expiresAt };
      });
    }
    catch (error) {
      // An unpersisted draft has no submitted bytes; never use its upload URL.
      await run("deletion", record, () => input.provider.delete(allocated.id)).catch(() => {});
      throw error;
    }
  }
  async function uploadReserved(record: R, reservation: PhotoObjectReservation, bytes: Uint8Array, token: string, state: { uncertain: boolean }) {
    const id = reservation.id!;
    if (await verify(record, id)) return id;
    if (!reservation.uploadURL || (reservation.expiresAt ?? 0) <= input.now()) throw new PhotoError("retired", "O envio expirou. Selecione a foto novamente.");
    await journal.change(record, (current) => {
      assertHeld(current, token);
      // Persist uncertainty before crossing the provider boundary, including a lost process.
      return extendedClaim(current);
    });
    state.uncertain = true;
    await run("upload", record, () => input.provider.upload(record, reservation, bytes));
    if (!await verify(record, id)) throw new PhotoObjectUnavailable("verification", record.operationId);
    state.uncertain = false;
    if ((await run("journal", record, () => journal.read(record)))?.status !== "pending") throw new PhotoError("retired", "Esta foto foi retirada.");
    return id;
  }
  function releaseClaim(record: R, token: string, uncertain: boolean) {
    return journal.change(record, (prior) => {
      if (!prior) throw new PhotoObjectUnavailable("journal", record.operationId);
      if (prior.claimToken !== token) return prior;
      return uncertain ? extendedClaim(prior) : { ...prior, claimToken: undefined, claimUntil: undefined };
    });
  }
  const objects: ReservedObjects<R> = {
    async create(record, bytes) {
      await assertReservedBytes(record, bytes);
      const previous = await lookup(record);
      if (previous?.id && await verify(record, previous.id)) return previous.id;
      const token = input.newId();
      const state = { uncertain: false };
      const claimed = await claim(record, token);
      try {
        return await uploadReserved(record, await ensureAllocated(record, claimed, token), bytes, token, state);
      }
      finally {
        await releaseClaim(record, token, state.uncertain);
      }
    },
    async head(record) {
      const reservation = await lookup(record);
      if (!reservation) return false;
      return run("verification", record, () => input.provider.head(record, reservation.id!));
    },
    async read(record) {
      const reservation = await lookup(record);
      return reservation ? run("verification", record, () => input.provider.read(record, reservation.id!)) : null;
    },
    ...(input.provider.deliver
      ? { async deliver(record: R, delivery: PhotoDelivery, probe?: boolean) {
          const reservation = await lookup(record);
          return reservation ? run("verification", record, () => input.provider.deliver!(record, reservation.id!, delivery, probe)) : null;
        } }
      : {}),
    async retire(record) {
      const reservation = await journal.change(record, (prior) => {
        if (record.generation && prior?.id !== record.generation) throw new PhotoError("conflict", "A referência da foto mudou antes da retirada.");
        return { ...prior, operationId: record.operationId, digest: record.digest, status: prior?.status === "retired" ? "retired" : "retiring" };
      });
      if (reservation.status === "retired") return;
      if ((reservation.claimUntil ?? 0) > input.now()) throw reservationConflict();
      if (reservation.id) {
        await run("deletion", record, () => input.provider.delete(reservation.id!));
        if (await run("deletion", record, () => input.provider.exists(reservation.id!))) throw new PhotoObjectUnavailable("deletion", record.operationId);
      }
      await journal.change(record, prior => ({ ...prior, operationId: record.operationId, digest: record.digest, status: "retired", uploadURL: undefined, claimToken: undefined, claimUntil: undefined }));
    },
  };
  return objects;
}
