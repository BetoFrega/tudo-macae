const ZONE = "America/Sao_Paulo";

// Use the timezone database in both directions so historical daylight-saving
// offsets round-trip with the entered wall-clock value.
const zoneParts = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** How far Macaé's clock is from UTC at a given instant, in milliseconds. */
function zoneOffsetAt(epoch: number): number {
  const parts = new Map(
    zoneParts.formatToParts(epoch).map(part => [part.type, part.value]),
  );
  const wallClock = Date.UTC(
    Number(parts.get("year")),
    Number(parts.get("month")) - 1,
    Number(parts.get("day")),
    // Midnight comes back as hour 24 in some ICU versions.
    Number(parts.get("hour")) % 24,
    Number(parts.get("minute")),
    Number(parts.get("second")),
  );
  return wallClock - Math.floor(epoch / 1000) * 1000;
}

/**
 * Reads a `datetime-local` input value (`"YYYY-MM-DDTHH:mm"`) as wall-clock
 * time in Macaé and returns the epoch milliseconds it names.
 *
 * Returns `NaN` for anything that is not that exact shape. The shape is
 * checked before parsing because `Date.parse` accepts far more than the
 * standard requires, and would turn junk into a plausible-looking instant.
 */
export function parseSaoPauloDateTime(value: string): number {
  const datetimeLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!datetimeLocal.test(value)) return Number.NaN;

  // Read the wall clock as if it were UTC, then subtract the offset in force
  // at that instant. Applied twice because the first offset is looked up at
  // the wrong instant, which only matters within an hour of a zone change.
  const asIfUtc = Date.parse(`${value}:00Z`);
  const approximate = asIfUtc - zoneOffsetAt(asIfUtc);
  return asIfUtc - zoneOffsetAt(approximate);
}

const saoPauloFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Writes an instant as the wall-clock time it names in Macaé, so a moment
 * reads the same whatever zone the server or the reader's machine is in.
 */
export function formatSaoPauloDateTime(epoch: number): string {
  return saoPauloFormat.format(epoch).replace(", ", " ");
}

const saoPauloDateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: ZONE,
  dateStyle: "short",
});

/**
 * Writes the calendar day an instant falls on in Macaé (`DD/MM/AAAA`). Both
 * locale and zone are fixed, so server and browser render the same text.
 */
export function formatSaoPauloDate(epoch: number): string {
  return saoPauloDateFormat.format(epoch);
}

/** Writes an instant in the exact shape accepted by `datetime-local`. */
export function formatSaoPauloDateTimeInput(epoch: number): string {
  const parts = new Map(
    zoneParts.formatToParts(epoch).map(part => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`
    + `T${String(Number(parts.get("hour")) % 24).padStart(2, "0")}`
    + `:${parts.get("minute")}`;
}
