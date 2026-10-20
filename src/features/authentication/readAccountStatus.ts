import type { VerificationContinuation } from "./emailVerificationReads";
import type { readAccountReminder } from "./emailVerificationReads";
import type { EmailVerificationValue } from "@tudomacae/authentication/ui";
export type { EmailVerificationValue } from "@tudomacae/authentication/ui";

export type AccountReminderValue = Awaited<ReturnType<typeof readAccountReminder>>;

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Account status request failed");
  return response.json() as Promise<unknown>;
}

function querySuffix(entries: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(entries)) {
    if (value) params.set(name, value);
  }
  return params.size ? `?${params}` : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value ? value as Record<string, unknown> : undefined;
}

/** Only same-origin paths may be followed; `//host` is protocol-relative and leaves the site. */
function isLocalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

export async function readAccountReminderFromBrowser(publication?: string): Promise<AccountReminderValue> {
  const value = await readJson(`/api/autenticacao/lembrete${querySuffix({ publication })}`);
  if (value === null) return null;
  const reminder = asRecord(value);
  if (!reminder || typeof reminder.text !== "string" || typeof reminder.label !== "string" || !isLocalPath(reminder.href)) {
    throw new Error("Invalid account reminder response");
  }
  return { text: reminder.text, label: reminder.label, href: reminder.href };
}

type EmailVerificationState = {
  uid: string; email: string; emailVerified: boolean; nextSendAt: number; destination: string;
  pendingEmail?: string; error?: string;
};

function isEmailVerificationState(state: Record<string, unknown>): state is Record<string, unknown> & EmailVerificationState {
  return typeof state.uid === "string"
    && typeof state.email === "string"
    && typeof state.emailVerified === "boolean"
    && typeof state.nextSendAt === "number"
    && isLocalPath(state.destination)
    && isOptionalString(state.pendingEmail)
    && isOptionalString(state.error);
}

export async function readEmailVerificationFromBrowser(continuation: VerificationContinuation = {}): Promise<EmailVerificationValue> {
  const value = await readJson(`/api/autenticacao/verificacao-email${querySuffix({ publication: continuation.publication, ad: continuation.ad })}`);
  if (value === null) return null;
  const state = asRecord(value);
  if (!state || !isEmailVerificationState(state)) throw new Error("Invalid email verification response");
  const { pendingEmail, error } = state;
  return {
    uid: state.uid, email: state.email, emailVerified: state.emailVerified,
    nextSendAt: state.nextSendAt, destination: state.destination,
    ...(pendingEmail === undefined ? {} : { pendingEmail }),
    ...(error === undefined ? {} : { error }),
  };
}
