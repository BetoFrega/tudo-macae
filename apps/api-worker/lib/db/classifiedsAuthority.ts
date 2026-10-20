import { ClassifiedsAuthorityUnavailable, type ClassifiedsAuthority } from "@tudomacae/classifieds-client/authority";

export async function readClassifiedsAuthority(database: D1Database): Promise<ClassifiedsAuthority> {
  // A stale replica must never send a post-cutover write back to Firebase.
  const row = await database.withSession("first-primary").prepare("SELECT authority FROM classifieds_authority WHERE id = 1").first<{ authority: string }>();
  if (row?.authority !== "legacy" && row?.authority !== "worker") throw new ClassifiedsAuthorityUnavailable();
  return row.authority;
}
