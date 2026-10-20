import type { createPhotoLifecycle } from "../index";
import { fixture, actor, upload } from "./fixture";
export async function run(module: { createPhotoLifecycle: typeof createPhotoLifecycle }) {
  const f = fixture();
  f.owner("ad");
  const lifecycle = module.createPhotoLifecycle(f.dependencies);
  const request = upload();
  const record = await lifecycle.reserve(actor, request);
  await lifecycle.upload(actor, request);
  await lifecycle.read(record.path, actor);
  await lifecycle.readAd("ad", record.id, actor);
  await lifecycle.publication(actor, "ad");
  await lifecycle.retireUnlinked(record.path);
  await lifecycle.remove(actor, record.path);
  await lifecycle.revoked(record.path);
  await lifecycle.sweep();
}
