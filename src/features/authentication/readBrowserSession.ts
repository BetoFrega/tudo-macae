import type { SessionUser } from "@tudomacae/authentication/session";

export class ReportedSessionFailure extends Error {}

export type SessionFailureCategory = "transport" | "http_status" | "response_decode" | "invalid_response";
export class SessionSynchronizationFailure extends Error {
  readonly category: SessionFailureCategory;
  readonly httpStatus: number | undefined;
  constructor(category: SessionFailureCategory, httpStatus?: number, options?: ErrorOptions) {
    super("Session synchronization failed", options);
    this.category = category;
    this.httpStatus = httpStatus;
  }
}

async function requestBrowserSession(operationId: string, method: "GET" | "POST"): Promise<Response> {
  try {
    return await fetch("/api/autenticacao/sessao", {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "x-session-operation-id": operationId },
    });
  }
  catch (error) {
    throw new SessionSynchronizationFailure("transport", undefined, { cause: error });
  }
}

function assertSessionResponse(response: Response): void {
  if (response.ok) return;
  if (response.status === 503 && response.headers.get("x-session-error-reported") === "1") {
    throw new ReportedSessionFailure("Session synchronization failed");
  }
  throw new SessionSynchronizationFailure("http_status", response.status);
}

async function readSessionBody(response: Response): Promise<unknown> {
  let body: string;
  try {
    body = await response.text();
  }
  catch (error) {
    throw new SessionSynchronizationFailure("transport", response.status, { cause: error });
  }
  try {
    return JSON.parse(body) as unknown;
  }
  catch (error) {
    throw new SessionSynchronizationFailure("response_decode", response.status, { cause: error });
  }
}

function isSessionUser(value: object): value is SessionUser {
  const user = value as Record<string, unknown>;
  return typeof user.uid === "string"
    && typeof user.emailVerified === "boolean"
    && typeof user.isAdmin === "boolean"
    && typeof user.isEditor === "boolean"
    && (user.email === undefined || typeof user.email === "string");
}

function decodeSessionUser(value: unknown, status: number): SessionUser | null {
  if (value === null) return null;
  if (typeof value !== "object" || !isSessionUser(value)) throw new SessionSynchronizationFailure("invalid_response", status);
  return { uid: value.uid, email: value.email, emailVerified: value.emailVerified, isAdmin: value.isAdmin, isEditor: value.isEditor };
}

async function fetchBrowserSession(operationId: string, method: "GET" | "POST"): Promise<SessionUser | null> {
  const response = await requestBrowserSession(operationId, method);
  assertSessionResponse(response);
  return decodeSessionUser(await readSessionBody(response), response.status);
}

export function readBrowserSession(operationId: string): Promise<SessionUser | null> {
  return fetchBrowserSession(operationId, "GET");
}

export function readBrowserSessionAfterMutation(operationId: string): Promise<SessionUser | null> {
  return fetchBrowserSession(operationId, "POST");
}
