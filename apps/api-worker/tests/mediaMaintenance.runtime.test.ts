import { afterEach, expect, test, vi } from "vitest";
import { QuarantineSweepIncomplete } from "@tudomacae/media/quarantineCleanup";
import { runMediaMaintenance } from "../lib/mediaMaintenance";
import type { EditorialMediaService } from "../lib/mediaHttp";

const now = 1_800_000_000_000;
function maintain(pages: (() => Promise<{ removedReservationIds: string[]; hasMore: boolean }>)[], expireActivity = vi.fn(async (_now: number) => 0), authority = "worker") {
  const sweep = vi.fn(() => pages.shift()!());
  const service = { authority: async () => authority, media: { quarantine: { sweep } }, persistence: { expireActivity } } as unknown as EditorialMediaService;
  return runMediaMaintenance({ editorialMedia: () => service }, {} as Env, now);
}
afterEach(() => {
  vi.restoreAllMocks();
});
const done = async () => ({ removedReservationIds: [], hasMore: false });
const incomplete = (removed: string[], failed: string[], hasMore: boolean) => async () => {
  throw new QuarantineSweepIncomplete(removed, failed, hasMore, new Error("Hosted Images unavailable"));
};

test("a reservation that fails on one page and is removed on a later one leaves a completed run", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  await maintain([incomplete(["a"], ["b"], true), async () => ({ removedReservationIds: ["b"], hasMore: false })]);
  expect(JSON.parse(String(info.mock.calls[0]![0]))).toMatchObject({ outcome: "completed", removed: 2, hasMore: false });
});

test("a reservation still failing after the last page fails the run", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(maintain([incomplete(["a"], ["b"], true), incomplete(["b"], ["c"], false)])).rejects.toBeInstanceOf(QuarantineSweepIncomplete);
  expect(JSON.parse(String(error.mock.calls[0]![0]))).toMatchObject({ outcome: "partial", removed: 2, failed: 1 });
});

test("Activity expiry repeats full batches at the scheduled instant and stops at a partial one", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const batches = [64, 64, 3];
  const expireActivity = vi.fn(async (_now: number) => batches.shift()!);
  await maintain([done], expireActivity);
  expect(expireActivity.mock.calls).toEqual([[now], [now], [now]]);
  expect(info.mock.calls.map(call => JSON.parse(String(call[0])))).toContainEqual(expect.objectContaining({ event: "editorial.activity.expiry", outcome: "completed", expired: 131, hasMore: false }));
});

test("Activity expiry stops after 8 full batches and reports the backlog under the run's operation id", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const expireActivity = vi.fn(async (_now: number) => 64);
  await maintain([async () => ({ removedReservationIds: ["a"], hasMore: false })], expireActivity);
  expect(expireActivity).toHaveBeenCalledTimes(8);
  const [sweep, expiry] = ["media.quarantine.sweep", "editorial.activity.expiry"].map(event => info.mock.calls.map(call => JSON.parse(String(call[0]))).find(entry => entry.event === event));
  expect(expiry).toMatchObject({ expired: 512, hasMore: true });
  expect(expiry.operationId).toBe(sweep.operationId);
});

test("Activity stays while the legacy runtime owns editorial writes", async () => {
  const expireActivity = vi.fn(async (_now: number) => 0);
  await maintain([done], expireActivity, "legacy");
  expect(expireActivity).not.toHaveBeenCalled();
});

test("a failed quarantine sweep still expires Activity and then fails the run", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const expireActivity = vi.fn(async (_now: number) => 0);
  await expect(maintain([incomplete([], ["b"], false)], expireActivity)).rejects.toBeInstanceOf(QuarantineSweepIncomplete);
  expect(expireActivity).toHaveBeenCalledOnce();
});

test("a failed Activity expiry still sweeps quarantine and then fails the run", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const sweep = vi.fn(done);
  await expect(maintain([sweep], vi.fn(async (_now: number) => Promise.reject(new Error("D1 unavailable"))))).rejects.toThrow("D1 unavailable");
  expect(sweep).toHaveBeenCalledOnce();
  expect(JSON.parse(String(error.mock.calls[0]![0]))).toMatchObject({ event: "editorial.activity.expiry", outcome: "failed", errorName: "Error" });
});
