import type { createReservedPhotoObjects } from "../index";
import { reservedFixture } from "./objectReservationsFixture";

export async function run(module: { createReservedPhotoObjects: typeof createReservedPhotoObjects }) {
  const f = await reservedFixture(module.createReservedPhotoObjects);
  await f.objects.create(f.record, f.bytes);
  await f.objects.head(f.record);
  await f.objects.read(f.record);
  await f.objects.retire(f.record);
}
