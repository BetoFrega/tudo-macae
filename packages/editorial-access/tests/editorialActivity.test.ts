import { describe, expect, test } from "vitest";
import { editorialActivityExpiresAt } from "@tudomacae/editorial-access/activity";

describe("editorial activity", () => {
  test("retains operational history for exactly 365 days", () => {
    const createdAt = Date.UTC(2026, 7, 28, 12, 0, 0);

    expect(editorialActivityExpiresAt(createdAt)).toBe(
      Date.UTC(2027, 7, 28, 12, 0, 0),
    );
  });
});
