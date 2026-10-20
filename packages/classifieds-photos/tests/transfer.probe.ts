import type { createPhotoTransfer } from "../transfer";
import { fixture, upload } from "./fixture";
export async function run(module: { createPhotoTransfer: typeof createPhotoTransfer }) {
  const f = fixture();
  const owner = f.owner("profile");
  owner.photoPath = "profile-photos/profile/old.png";
  const request = upload("profile");
  const transfer = module.createPhotoTransfer({ ...f.dependencies, source: async () => ({ bytes: request.bytes, mimeType: request.mimeType, generation: "source" }) });
  await transfer.importItem({ ...request, path: owner.photoPath, id: request.operationId, size: request.bytes.length, digest: await f.dependencies.digest(request.bytes), sourceGeneration: "source" }, true);
}
