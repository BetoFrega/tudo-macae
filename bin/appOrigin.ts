/**
 * The canonical origin the app serves from, for the processes that have to
 * reproduce production's environment locally.
 *
 * The production web Worker reads `PUBLIC_APP_ORIGIN` from `wrangler.web.jsonc`,
 * so this is a mirror, and `bin/appOrigin.test.ts` fails if the two drift.
 */
export const CANONICAL_APP_ORIGIN = "https://www.tudomacae.com.br";
