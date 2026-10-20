/**
 * The prefix that marks everything the demo seed owns — uids and document ids
 * alike.
 *
 * It is the seed's central invariant, and it is what makes a restart safe: the
 * seed rewrites what carries this prefix and reads nothing else, so a profile
 * or an account created by hand is never in its way. Spelled once here because
 * a second spelling that drifted would either orphan the old documents or start
 * overwriting somebody's work.
 */
export const DEMO_KEY_PREFIX = "demo-";

/** The uid or document id a data-file key always resolves to. */
export function demoIdFor(key: string): string {
  return `${DEMO_KEY_PREFIX}${key}`;
}
