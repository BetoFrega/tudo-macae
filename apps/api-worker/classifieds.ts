import { createD1ClassifiedsPersistence } from "./lib/db/classifieds";

/** Explicit composition only; importing this entry performs no I/O. */
export const createClassifiedsPersistence = createD1ClassifiedsPersistence;
export { createClassifiedsCapabilities } from "./lib/classifiedsCapabilities";
export type { ClassifiedsActor } from "./lib/classifiedsCapabilities";
