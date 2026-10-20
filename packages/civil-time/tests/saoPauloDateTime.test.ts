import { describe, expect, test } from "vitest";
import {
  formatSaoPauloDate,
  formatSaoPauloDateTime,
  formatSaoPauloDateTimeInput,
  parseSaoPauloDateTime,
} from "@tudomacae/civil-time";

describe("parseSaoPauloDateTime", () => {
  test("reads a datetime-local value as America/Sao_Paulo wall time", () => {
    const epoch = parseSaoPauloDateTime("2026-08-20T14:30");

    expect(epoch).toBe(Date.parse("2026-08-20T17:30:00.000Z"));
  });

  test("applies the same offset in January as in August, DST being abolished", () => {
    const epoch = parseSaoPauloDateTime("2026-01-15T09:00");

    expect(epoch).toBe(Date.parse("2026-01-15T12:00:00.000Z"));
  });

  // Before 2019 the zone did shift, and a fixed -03:00 would be an hour off
  // here. The zone comes from the tz database precisely so this holds.
  test("applies the daylight-saving offset that was in force before 2019", () => {
    const epoch = parseSaoPauloDateTime("2018-01-15T09:00");

    expect(epoch).toBe(Date.parse("2018-01-15T11:00:00.000Z"));
  });

  // The hours just after a zone change are the only ones where looking the
  // offset up at the wrong instant gives a different answer, so they are what
  // proves the correction is applied rather than merely written down.
  test("uses the offset in force after a change, not the one before it", () => {
    // Daylight saving ended in Brazil at midnight on 2018-02-18: -02:00 → -03:00.
    expect(parseSaoPauloDateTime("2018-02-18T00:30")).toBe(
      Date.parse("2018-02-18T03:30:00.000Z"),
    );
  });

  test("uses the offset in force after a change in the other direction", () => {
    // Daylight saving began at midnight on 2018-11-04: -03:00 → -02:00.
    expect(parseSaoPauloDateTime("2018-11-04T01:30")).toBe(
      Date.parse("2018-11-04T03:30:00.000Z"),
    );
  });

  test("refuses text that merely ends with a datetime", () => {
    expect(
      Number.isNaN(parseSaoPauloDateTime("lixo2026-08-20T14:30")),
    ).toBe(true);
  });

  test("refuses text that merely starts with a datetime", () => {
    expect(
      Number.isNaN(parseSaoPauloDateTime("2026-08-20T14:30lixo")),
    ).toBe(true);
  });

  test("returns NaN for a value that is not a datetime-local string at all", () => {
    expect(Number.isNaN(parseSaoPauloDateTime("not-a-date"))).toBe(true);
  });
});

describe("formatSaoPauloDateTime", () => {
  test("writes an instant as the wall-clock time it names in Macaé", () => {
    expect(
      formatSaoPauloDateTime(Date.parse("2026-08-20T17:30:00.000Z")),
    ).toBe("20/08/2026 14:30");
  });

  test("writes the day before midnight UTC as the day it still is in Macaé", () => {
    expect(
      formatSaoPauloDateTime(Date.parse("2026-08-21T02:00:00.000Z")),
    ).toBe("20/08/2026 23:00");
  });

  test("writes the pre-2019 offset the tz database records", () => {
    expect(
      formatSaoPauloDateTime(Date.parse("2018-01-15T11:00:00.000Z")),
    ).toBe("15/01/2018 09:00");
  });
});

describe("formatSaoPauloDateTimeInput", () => {
  test("writes the exact value a datetime-local control expects", () => {
    expect(
      formatSaoPauloDateTimeInput(Date.parse("2026-08-20T17:30:00.000Z")),
    ).toBe("2026-08-20T14:30");
  });

  test("pads a single-digit local hour for a datetime-local control", () => {
    expect(
      formatSaoPauloDateTimeInput(Date.parse("2026-08-20T07:05:00.000Z")),
    ).toBe("2026-08-20T04:05");
  });
});

describe("the round trip an editor sees", () => {
  test.each([
    "2026-01-15T09:05",
    "2026-08-20T14:30",
    "2026-12-31T23:59",
    "2018-01-15T09:00",
  ])("reads back %s unchanged", (typed) => {
    expect(formatSaoPauloDateTime(parseSaoPauloDateTime(typed))).toBe(
      typed.replace(/(\d{4})-(\d{2})-(\d{2})T/, "$3/$2/$1 "),
    );
  });
});

describe("formatSaoPauloDate", () => {
  test("writes the day in Brazilian day/month/year order", () => {
    expect(
      formatSaoPauloDate(Date.parse("2026-10-12T18:50:00.000Z")),
    ).toBe("12/10/2026");
  });

  test("writes the day before midnight UTC as the day it still is in Macaé", () => {
    expect(
      formatSaoPauloDate(Date.parse("2026-10-13T02:00:00.000Z")),
    ).toBe("12/10/2026");
  });
});
