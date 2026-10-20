import { ClassifiedsRequestError, isClassifiedsRequestId } from "../protocol";

export type ClassifiedsCredential = { session?: string | undefined; service?: { token: string; actorId: string } };

const localHostnames = ["localhost", "127.0.0.1", "authentication.test"];

/** Accepts only a bare HTTPS origin, or plain HTTP to a local host when explicitly allowed. */
export function parseServiceOrigin(configuration: { origin: string; allowLocal?: boolean }, message: string) {
  const origin = new URL(configuration.origin);
  const local = configuration.allowLocal && localHostnames.includes(origin.hostname) && origin.protocol === "http:";
  if ((!local && origin.protocol !== "https:") || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new TypeError(message);
  return origin;
}

export function classifiedsRequestId(correlationId: string) {
  return isClassifiedsRequestId(correlationId) ? correlationId : crypto.randomUUID();
}

export function classifiedsHeaders(publicOrigin: string, requestId: string, credential: ClassifiedsCredential) {
  const headers = new Headers({ "origin": publicOrigin, "x-request-id": requestId, "x-classifieds-protocol": "1", "x-authentication-protocol": "1" });
  if (credential.session) headers.set("cookie", `session=${encodeURIComponent(credential.session)}`);
  if (credential.service) {
    headers.set("authorization", `Bearer ${credential.service.token}`);
    headers.set("x-classifieds-actor", credential.service.actorId);
  }
  return headers;
}

/** Rejects a response outside the Classifieds protocol; returns whether the server already reported the failure. */
export function checkProtocol(response: Response, requestId: string) {
  const serverReportedFailure = response.headers.get("x-classifieds-error-reported") === "1";
  if (response.headers.get("x-classifieds-protocol") !== "1") throw new ClassifiedsRequestError("incompatible", requestId, serverReportedFailure);
  return serverReportedFailure;
}

export function unexpectedStatusError(status: number, requestId: string, serverReportedFailure: boolean) {
  return new ClassifiedsRequestError(status === 401 || status === 403 ? "forbidden" : "unavailable", requestId, serverReportedFailure);
}
