import { createCanonicalLookup, type CanonicalLookup } from "@tudomacae/classifieds-client/canonical";

let configured: { origin: string; lookup: CanonicalLookup } | undefined;

/** The proxy's canonical page lookup against the API Worker; missing or invalid configuration renders every page. */
export const canonicalLookup: CanonicalLookup = async (target, options) => {
  const origin = process.env.AUTHENTICATION_API_URL;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin || !publicOrigin) return undefined;
  try {
    if (configured?.origin !== origin) configured = { origin, lookup: createCanonicalLookup({ origin, publicOrigin, allowLocal: true }) };
  }
  catch {
    return undefined;
  }
  return configured.lookup(target, options);
};
