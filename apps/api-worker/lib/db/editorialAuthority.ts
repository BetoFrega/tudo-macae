export type EditorialAuthority = "legacy" | "worker";

export class EditorialAuthorityUnavailable extends Error {
  constructor() {
    super("Editorial authority unavailable");
    this.name = "EditorialAuthorityUnavailable";
  }
}

export async function readEditorialAuthority(database: D1Database): Promise<EditorialAuthority> {
  // A stale replica must never send a post-cutover write back to Firebase.
  const row = await database.withSession("first-primary").prepare("SELECT authority FROM editorial_authority WHERE id = 1").first<{ authority: string }>();
  if (row?.authority !== "legacy" && row?.authority !== "worker") throw new EditorialAuthorityUnavailable();
  return row.authority;
}
