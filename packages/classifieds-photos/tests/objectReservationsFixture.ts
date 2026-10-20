import { createReservedPhotoObjects, type PhotoObjectReservation, type PhotoRecord, type ReservedPhotoProvider } from "../index";
import { fixture, actor, upload } from "./fixture";

export async function reservedFixture(factory = createReservedPhotoObjects) {
  const f = fixture();
  f.owner("ad");
  const request = upload();
  const record = await f.lifecycle.reserve(actor, request);
  let reservation: PhotoObjectReservation | null = null;
  let journalFailed = false;
  let allocated = 0;
  let generation: string | undefined;
  let value: { bytes: Uint8Array; mimeType: string } | null = null;
  const provider: ReservedPhotoProvider = {
    allocate: async () => ({ id: `image-${++allocated}`, uploadURL: "https://upload.invalid/private-capability" }),
    upload: async (photo, reserved, bytes) => {
      generation = reserved.id;
      value = { bytes, mimeType: photo.mimeType };
    },
    read: async () => value,
    head: async () => !!value,
    delete: async () => { value = null; },
    exists: async () => !!value,
  };
  const journal = {
    read: async () => {
      if (journalFailed) throw new Error("private journal sentinel");
      return reservation;
    },
    change: async (_record: PhotoRecord, decide: (prior: PhotoObjectReservation | null) => PhotoObjectReservation) => {
      if (journalFailed) throw new Error("private journal sentinel");
      reservation = decide(reservation);
      return reservation;
    },
  };
  const dependencies = { provider, journal, now: f.dependencies.now, newId: f.dependencies.newId, digest: f.dependencies.digest };
  return { record, bytes: request.bytes, provider, objects: factory(dependencies), dependencies,
    reservation: () => reservation, allocations: () => allocated, generation: () => generation,
    failJournal: (failed: boolean) => { journalFailed = failed; }, advance: f.advance };
}
