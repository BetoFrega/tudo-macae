import { afterEach, expect, test, vi } from "vitest";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
const read = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ cacheTag: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({ getPublicAdvertiserProfileUseCase: read }));
import { getPublicAdvertiserProfile } from "./getPublicAdvertiserProfile";
afterEach(() => {
  vi.restoreAllMocks();
});
test.each(["unavailable", "incompatible", "forbidden"] as const)("a %s qualified authority retains its diagnostic correlation and is not cached as missing", async (code) => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const unavailable = new ClassifiedsRequestError(code, crypto.randomUUID());
  read.mockRejectedValueOnce(unavailable);
  await expect(getPublicAdvertiserProfile("profile")).rejects.toBe(unavailable);
  expect(JSON.parse(report.mock.calls[0]![0])).toMatchObject({ event: "advertiser_profile.public_read.failed", cause: code, requestId: unavailable.requestId, outcome: "authority_failure" });
});
test("the public profile and genuine absence preserve their result", async () => {
  const profile = { id: "profile", title: "Negócio", isClaimable: true };
  read.mockResolvedValueOnce(profile).mockResolvedValueOnce(null);
  expect(await getPublicAdvertiserProfile("profile")).toEqual(profile);
  expect(await getPublicAdvertiserProfile("missing")).toBeNull();
});
test("a Worker-reported failure propagates without a duplicate caller event", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = new ClassifiedsRequestError("unavailable", crypto.randomUUID(), true);
  read.mockRejectedValueOnce(failure);
  await expect(getPublicAdvertiserProfile("profile")).rejects.toBe(failure);
  expect(report).not.toHaveBeenCalled();
});
test("legacy failures retain the missing-profile response with sanitized diagnostics", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValueOnce(new Error("private provider detail"));
  expect(await getPublicAdvertiserProfile("profile")).toBeNull();
  expect(JSON.parse(report.mock.calls[0]![0])).toMatchObject({ event: "advertiser_profile.public_read.failed", cause: "Error", operationId: expect.any(String) });
  expect(String(report.mock.calls[0]![0])).not.toContain("private provider detail");
});
