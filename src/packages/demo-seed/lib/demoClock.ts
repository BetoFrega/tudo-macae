const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

/**
 * Turns a "days ago" offset from a data file into an epoch timestamp, measured
 * from the instant the server booted.
 *
 * Offsets rather than absolute epochs, per `src/packages/demo-seed/README.md`:
 * the home page elects its headline by recency across the whole database, so a
 * demo article dated in the future would win that election and fail an e2e test
 * that has no defect. Relative offsets also keep the demo site from ageing.
 *
 * Rejects a negative offset instead of clamping it. A data file that asks for
 * tomorrow is a mistake worth seeing at boot — `register()` logs the failure —
 * rather than a silently corrected date nobody notices.
 */
export function timestampDaysBeforeBoot(
  bootTime: number,
  daysAgo: number,
): number {
  if (!Number.isFinite(daysAgo) || daysAgo < 0) {
    throw new Error(
      `Demo seed offsets are measured backwards from boot; got ${daysAgo} days ago, which is a date in the future.`,
    );
  }

  return bootTime - daysAgo * MILLISECONDS_IN_A_DAY;
}
