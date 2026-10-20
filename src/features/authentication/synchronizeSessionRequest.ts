import { cookies } from "next/headers";
import { resolveSession } from "@/integrations/authentication/session";
import { createSessionSynchronizer } from "@tudomacae/authentication/session-synchronization";

/**
 * Synchronizes browser authentication from a mutation-capable request. Invalid
 * cookies are removed here so later navigations stop sending them; render code
 * uses `getCurrentUser` and remains read-only.
 */
export async function synchronizeSessionRequest() {
  const cookieStore = await cookies();
  const synchronizer = createSessionSynchronizer({
    resolve: resolveSession,
    async clearInvalidCookies() {
      cookieStore.delete("session");
      cookieStore.delete("verification-refresh");
    },
  });
  return synchronizer.synchronize(cookieStore.get("session")?.value);
}
