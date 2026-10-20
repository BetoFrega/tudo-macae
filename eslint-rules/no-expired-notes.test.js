import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-expired-notes.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester();

/** UTC midnight today, matching how the rule compares dates. */
function today() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isoDaysFromToday(days) {
  return new Date(today() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Independent restatement of the rule's month arithmetic — stepping one month
 * at a time rather than adding an offset — so a bug in the rule's clamping
 * cannot be mirrored by an identical bug here.
 */
function isoMonthsFromToday(months) {
  const start = new Date(today());
  const day = start.getUTCDate();
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();

  for (let step = 0; step < months; step++) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth)))
    .toISOString()
    .slice(0, 10);
}

const BUMPED = isoMonthsFromToday(3);

describe("no-expired-notes", () => {
  ruleTester.run("no-expired-notes", rule, {
    valid: [
      { code: "// nothing to see here" },
      { code: `// @expires ${isoDaysFromToday(1)} tomorrow is still in time` },
      { code: `// @expires ${isoDaysFromToday(365)} plenty of runway` },

      // The deadline day itself is still valid — a note expires *after* its
      // date, so landing a fix on the last day is not a failure.
      { code: `// @expires ${isoDaysFromToday(0)} due today, not overdue` },

      // A leap day that exists.
      { code: "// @expires 2028-02-29 real leap day" },

      // `@expires` has to be the whole word, or every mention of expiry in
      // prose would become a deadline.
      { code: "// unexpires 2000-01-01" },
      { code: "// @expiresat 2000-01-01" },
    ],

    invalid: [
      {
        code: "// @expires 2000-01-01 long overdue",
        errors: [{
          messageId: "expired",
          suggestions: [{
            messageId: "bump",
            data: { date: BUMPED },
            output: `// @expires ${BUMPED} long overdue`,
          }],
        }],
      },

      // The boundary: one day past the deadline fails.
      {
        code: `// @expires ${isoDaysFromToday(-1)} due yesterday`,
        errors: [{
          messageId: "expired",
          suggestions: [{
            messageId: "bump",
            output: `// @expires ${BUMPED} due yesterday`,
          }],
        }],
      },

      // A date that parses as digits but does not exist on a calendar. Without
      // the round-trip check this would roll into March and lint clean.
      {
        code: "// @expires 2026-02-31 not a real day",
        errors: [{
          messageId: "invalidDate",
          data: { found: "2026-02-31" },
          suggestions: [{
            messageId: "bump",
            output: `// @expires ${BUMPED} not a real day`,
          }],
        }],
      },

      {
        code: "// @expires soon",
        errors: [{
          messageId: "invalidDate",
          data: { found: "soon" },
          suggestions: [{
            messageId: "bump",
            output: `// @expires ${BUMPED}`,
          }],
        }],
      },

      // Bare marker: the date is missing rather than wrong. The fix supplies
      // its own separator, since there is no date text to replace.
      {
        code: "// @expires",
        errors: [{
          messageId: "missingDate",
          suggestions: [{
            messageId: "bump",
            output: `// @expires ${BUMPED}`,
          }],
        }],
      },

      // A missing date must not swallow the next line's first token.
      {
        code: "// @expires\n// 2000-01-01 is a separate line",
        errors: [{
          messageId: "missingDate",
          suggestions: [{
            messageId: "bump",
            output: `// @expires ${BUMPED}\n// 2000-01-01 is a separate line`,
          }],
        }],
      },

      {
        code: "// @expires 2000-01-01 first\n// @expires 2000-06-01 second",
        errors: [
          {
            messageId: "expired",
            suggestions: [{
              messageId: "bump",
              output: `// @expires ${BUMPED} first\n// @expires 2000-06-01 second`,
            }],
          },
          {
            messageId: "expired",
            suggestions: [{
              messageId: "bump",
              output: `// @expires 2000-01-01 first\n// @expires ${BUMPED} second`,
            }],
          },
        ],
      },

      // The configured bump drives the suggestion.
      {
        code: "// @expires 2000-01-01 custom bump",
        options: [{ bumpMonths: 6 }],
        errors: [{
          messageId: "expired",
          suggestions: [{
            messageId: "bump",
            output: `// @expires ${isoMonthsFromToday(6)} custom bump`,
          }],
        }],
      },
    ],
  });
});
