import { ClassifiedsAuthorityUnavailable } from "@tudomacae/classifieds-client/authority";
import { PhotoObjectUnavailable } from "@tudomacae/classifieds-photos";
import { StoredClassifiedsDataError } from "./lib/db/classifiedsSupport";
import { ClassifiedsPhotoDecodeUnavailable } from "./lib/storage/classifiedsPhotoDecoder";

function providerCause(error: Error) {
  if (error instanceof ClassifiedsAuthorityUnavailable) return "classifieds_authority_unavailable";
  if (error instanceof PhotoObjectUnavailable) return `hosted_photo_${error.phase}`;
  if (error instanceof StoredClassifiedsDataError) return "persisted_data_invalid";
  if (error instanceof ClassifiedsPhotoDecodeUnavailable) return error.causeCode;
  return undefined;
}

function runtimeCause(error: Error) {
  if (/^D1_/.test(error.message)) return "d1_execution";
  if (error instanceof TypeError) return "type_error";
  if (error instanceof RangeError) return "range_error";
  return error.cause === undefined ? "runtime_error" : undefined;
}

/** Bounded cause codes preserve provider attribution without exception text or payloads. */
export function classifiedsFailureCause(error: unknown): string {
  for (let depth = 0; depth < 3 && error instanceof Error; depth++) {
    const cause = providerCause(error) ?? runtimeCause(error);
    if (cause) return cause;
    error = error.cause;
  }
  return "unknown_error";
}
