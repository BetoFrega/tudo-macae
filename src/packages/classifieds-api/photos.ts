import { cookies } from "next/headers";
import { createClassifiedsPhotoClient } from "@tudomacae/classifieds-client/photos";
export function classifiedsPhotos() {
  const origin = process.env.AUTHENTICATION_API_URL;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin || !publicOrigin) throw new Error("Classifieds photo configuration missing");
  return createClassifiedsPhotoClient({ origin, publicOrigin, allowLocal: true });
}
export async function classifiedsPhotoCredential() {
  return { session: (await cookies()).get("session")?.value };
}
