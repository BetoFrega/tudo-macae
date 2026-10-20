import type { EditorialCaller } from "@tudomacae/editorial-access/caller";
import { editorialCallerDetails } from "@tudomacae/editorial-access/caller";

const mediaAdministrator = Symbol("mediaAdministrator");
export type MediaAdministratorCaller = { readonly [mediaAdministrator]: true };
export type EditorialMediaCaller = EditorialCaller | MediaAdministratorCaller;
interface MediaAdministratorDetails {
  editorId: string;
  administratorId: string;
  channel: "administration";
}
export type MediaMutationCallerDetails
  = ReturnType<typeof editorialCallerDetails> | MediaAdministratorDetails;
const administrators = new WeakMap<MediaAdministratorCaller, MediaAdministratorDetails>();

/** Derived from the authenticated administration session; valid only for the media interface. */
export function administrativeMediaCaller(administratorId: string): MediaAdministratorCaller {
  const caller = Object.freeze({}) as MediaAdministratorCaller;
  administrators.set(caller, { editorId: administratorId, administratorId, channel: "administration" });
  return caller;
}

export function mediaMutationCallerDetails(caller: EditorialMediaCaller): MediaMutationCallerDetails {
  return administrators.get(caller as MediaAdministratorCaller)
    ?? editorialCallerDetails(caller as EditorialCaller);
}

export function mediaReadCallerDetails(caller: EditorialMediaCaller) {
  return administrators.get(caller as MediaAdministratorCaller)
    ?? editorialCallerDetails(caller as EditorialCaller);
}
