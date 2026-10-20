import { ClassifiedsRequestError } from "./protocol";
export type ClassifiedsAuthority = "legacy" | "worker";
export class ClassifiedsAuthorityUnavailable extends ClassifiedsRequestError {
  constructor(requestId = "", serverReportedFailure = false) {
    super("unavailable", requestId, serverReportedFailure);
    this.message = "Classifieds authority unavailable";
    this.name = "ClassifiedsAuthorityUnavailable";
  }
}
