import { createD1EditorialPersistence } from "./lib/db/editorial";

/** Explicit composition only; importing this entry performs no I/O. No production entry composes it yet. */
export const createEditorialPersistence = createD1EditorialPersistence;
