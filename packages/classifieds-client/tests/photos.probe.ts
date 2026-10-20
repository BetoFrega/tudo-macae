import type { createClassifiedsPhotoClient } from "../photos";
export async function run(module: { createClassifiedsPhotoClient: typeof createClassifiedsPhotoClient }) {
  const operationId = crypto.randomUUID();
  const client = module.createClassifiedsPhotoClient({ origin: "https://api.test", publicOrigin: "https://www.test", request: async (url) => {
    const path = new URL(url.toString()).pathname;
    const headers = { "x-classifieds-protocol": "1" };
    if (path.endsWith("/upload")) return Response.json({ path: `profile-photos/profile/${operationId}.png`, id: operationId, operationId, ownerKind: "profile", ownerId: "profile", digest: "a".repeat(64), size: 8, mimeType: "image/png", status: "linked", createdAt: 1, updatedAt: 1, expiresAt: 2, retryAt: 2, attempts: 0, reservedRevision: 2, generation: "one", title: "", description: "" }, { headers });
    if (path.endsWith("/remove")) return Response.json({ status: "scheduled" }, { headers });
    return new Response(new Uint8Array([137]), { headers: { ...headers, "content-type": "image/png" } });
  } });
  await client.upload({ ownerKind: "profile", ownerId: "profile", operationId, expectedRevision: 1, mimeType: "image/png", bytes: new Uint8Array([137]) }, {});
  await client.remove("profile-photos/profile/photo.png", {});
  await client.readAd("ad", "photo", true);
  await client.readPublic("profile-photos/profile/photo.png");
}
