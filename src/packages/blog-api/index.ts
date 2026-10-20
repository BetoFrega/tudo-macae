import { cookies } from "next/headers.js";
import { createEditorialBlogClient } from "@tudomacae/editorial-blog/client";
import type { SavePostInput } from "@tudomacae/editorial-blog/blog";

/** The API Worker's Blog for the current session. A missing origin is a broken deployment, so it throws. */
export async function workerBlog() {
  const origin = process.env.AUTHENTICATION_API_URL;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin || !publicOrigin) throw new Error("Blog configuration missing");
  const client = createEditorialBlogClient({ origin, publicOrigin, allowLocal: true });
  const session = (await cookies()).get("session")?.value;
  return {
    list: (cursor?: string) => client.list(cursor, session),
    read: (id: string) => client.read(id, session),
    save: (input: SavePostInput, correlationId: string) => client.save(input, session, correlationId),
    takeOffline: (input: { id: string; expectedRevision: number }, correlationId: string) => client.takeOffline(input, session, correlationId),
  };
}
