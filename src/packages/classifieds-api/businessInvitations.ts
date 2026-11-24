import { route } from "./route";

/** The token from the invitation e-mail is the only credential; no session is needed. */
export const businessInvitations = {
  unsubscribe: route<(token: string) => Promise<{ unsubscribed: boolean }>>("invitations.unsubscribe", token => ({ token }), true),
};
