import { expect, test } from "vitest";
import { adStatus, canDiscoverAd, hasPendingPublication } from "../visibility";

test.each(["pending", "publishing", "deleting"])("%s remains pending work and cannot be publicly discovered", (publicationState) => {
  expect(hasPendingPublication({ publicationState })).toBe(true);
  expect(canDiscoverAd({ publicationState, status: "active" })).toBe(false);
});

test.each([{}, { publicationState: "published" }])("completed publication discovery respects visibility and deletion (%j)", (record) => {
  expect(hasPendingPublication(record)).toBe(false);
  expect(canDiscoverAd({ ...record, status: "active" })).toBe(true);
  expect(canDiscoverAd({ ...record, status: "paused" })).toBe(false);
  expect(canDiscoverAd({ ...record, status: "active", deleting: true })).toBe(false);
});

test.each([{}, { status: "" as const }, { status: null }])("an Ad without status is paused (%j)", (record) => {
  expect(adStatus(record)).toBe("paused");
});

test.each(["active", "paused"] as const)("an Ad keeps its stored %s status", (status) => {
  expect(adStatus({ status })).toBe(status);
});
