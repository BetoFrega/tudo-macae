/**
 * Fails a build once a dated note passes its own deadline.
 *
 * A workaround that says "remove this when upstream fixes X" only survives as
 * long as someone remembers it. This rule turns that memory into a date:
 *
 *     # @expires 2026-11-01 drop once typescript-eslint supports TypeScript 7
 *
 * On 2026-11-02 the lint fails and whoever hits it has to decide — resolve the
 * note, or push the date out because the reason still holds. Both are fine; the
 * point is that the decision happens instead of never coming up again.
 *
 * The date is scanned out of the raw file text rather than off the AST, so the
 * same marker works in every language ESLint can parse here: a YAML `#`
 * comment, a JS `//`, a CSS block comment. The cost is that a marker inside a
 * string literal counts too, which for a repo-wide deadline is the behaviour
 * you want anyway.
 *
 * A malformed date is an error rather than a skip. `@expires soon` that quietly
 * lints clean is worse than no marker at all — it looks like a live deadline
 * while guarding nothing.
 */

const MARKER = /@expires\b[^\S\n]*(\S*)/g;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Offsets of the first character of each line, for offset → {line, column}. */
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function locAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - starts[low] };
}

/**
 * Parses `YYYY-MM-DD` as a UTC midnight timestamp, or returns null.
 *
 * Round-trips the parsed fields so that a well-formed but non-existent date
 * like 2026-02-31 is rejected instead of silently rolling into March.
 */
function parseIsoDate(text) {
  const match = ISO_DATE.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  const roundTrips = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;

  return roundTrips ? timestamp : null;
}

function formatIsoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Today at UTC midnight, so the comparison is date-to-date, not instant-to-instant. */
function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Adds whole months, clamping to the end of the target month — otherwise
 * bumping from the 31st lands two months out.
 */
function addMonths(timestamp, months) {
  const from = new Date(timestamp);
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay));
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Fail once an `@expires <YYYY-MM-DD>` note has passed its deadline.",
    },
    hasSuggestions: true,
    schema: [{
      type: "object",
      properties: {
        bumpMonths: {
          type: "integer",
          minimum: 1,
          description: "How far ahead the bump suggestion moves the deadline.",
        },
      },
      additionalProperties: false,
    }],
    messages: {
      expired:
        "This note expired {{days}} day(s) ago, on {{date}}{{note}}. Resolve it, "
        + "or bump the date if the reason still holds.",
      invalidDate:
        "`@expires` needs a date as YYYY-MM-DD, but found \"{{found}}\". A "
        + "deadline that cannot be parsed guards nothing.",
      missingDate:
        "`@expires` needs a date as YYYY-MM-DD. A deadline with no date guards "
        + "nothing.",
      bump: "Bump the deadline to {{date}}.",
    },
  },

  create(context) {
    const { bumpMonths = 3 } = context.options[0] ?? {};
    const text = context.sourceCode.text;
    const today = todayUtc();

    function check() {
      const starts = lineStarts(text);
      MARKER.lastIndex = 0;

      for (let match = MARKER.exec(text); match; match = MARKER.exec(text)) {
        const found = match[1];
        const dateStart = match.index + match[0].length - found.length;
        const dateEnd = dateStart + found.length;
        const loc = {
          start: locAt(starts, match.index),
          end: locAt(starts, dateEnd),
        };

        const suggestion = (timestamp) => {
          const date = formatIsoDate(timestamp);
          // With no date to replace, the range is empty and sits flush against
          // the marker, so the separator has to come from the fix itself.
          const replacement = found === "" ? ` ${date}` : date;

          return [{
            messageId: "bump",
            data: { date },
            fix: fixer => fixer.replaceTextRange([dateStart, dateEnd], replacement),
          }];
        };

        if (found === "") {
          context.report({
            loc,
            messageId: "missingDate",
            suggest: suggestion(addMonths(today, bumpMonths)),
          });
          continue;
        }

        const deadline = parseIsoDate(found);

        if (deadline === null) {
          context.report({
            loc,
            messageId: "invalidDate",
            data: { found },
            suggest: suggestion(addMonths(today, bumpMonths)),
          });
          continue;
        }

        if (today > deadline) {
          // The rest of the line is the "why" the author left behind. Echoing it
          // saves the reader a trip to the file to find out what expired — minus
          // the host language's closing comment delimiter, which is not part of
          // the note and reads as noise in the message.
          const lineEnd = text.indexOf("\n", dateEnd);
          const trailing = text
            .slice(dateEnd, lineEnd === -1 ? text.length : lineEnd)
            .replace(/\s*(\*\/|-->|["'`],?)\s*$/, "")
            .trim();

          context.report({
            loc,
            messageId: "expired",
            data: {
              date: formatIsoDate(deadline),
              days: String(Math.round((today - deadline) / MS_PER_DAY)),
              note: trailing === "" ? "" : `: ${trailing}`,
            },
            suggest: suggestion(addMonths(today, bumpMonths)),
          });
        }
      }
    }

    // One handler per language root, because the rule runs under every language
    // plugin configured here — `Program` is JS/TS, `Document` is YAML and JSON,
    // `StyleSheet` is CSS, `root` is Markdown. Only the matching one ever fires.
    return {
      Program: check,
      Document: check,
      StyleSheet: check,
      root: check,
    };
  },
};

export default rule;
