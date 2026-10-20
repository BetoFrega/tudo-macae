import { createHash } from "node:crypto";

/**
 * Owner of ingestion intents and upload reservations. Every store must derive the same value, because the
 * transferred records keep it and ownership checks compare it with the live caller.
 */
export function mediaOwnerId(caller: { channel: string; editorId: string; editorialClientId?: string }) {
  return createHash("sha256").update(JSON.stringify([
    caller.channel, caller.editorId,
    caller.channel === "mcp" ? caller.editorialClientId : null,
  ])).digest("hex");
}
