import { expect, test } from "vitest";
import { adImageCleanupBackoffMs, adImageCleanupJobId, adImageCleanupPurgeOperationId } from "../imageCleanupJob";

test("an upload receipt cannot delete a later removal job for the same path", () => {
  const path = "ad-images/ad-1/pending/photo.jpg";
  expect(adImageCleanupJobId(path, "upload")).not.toBe(adImageCleanupJobId(path, "remove"));
});

test("each deleted photo keeps separate purge recovery under one profile operation", () => {
  const first = adImageCleanupPurgeOperationId("profile-delete", "ad-images/ad-1/first.jpg");
  const second = adImageCleanupPurgeOperationId("profile-delete", "ad-images/ad-1/second.jpg");
  expect(first).not.toBe(second);
  expect(first.startsWith("profile-delete:")).toBe(true);
  expect(second.startsWith("profile-delete:")).toBe(true);
});

test("deferral backs off from one hour and never exceeds a day", () => {
  const hour = 60 * 60_000;
  expect([0, 1, 2, 3, 4, 5, 6, 50].map(adImageCleanupBackoffMs)).toEqual([1, 2, 4, 8, 16, 24, 24, 24].map(hours => hours * hour));
  expect([-1, Number.NaN].map(adImageCleanupBackoffMs)).toEqual([hour, hour]);
});
