import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { verifyAdOwnershipUseCase } from "@/integrations/ads/use-cases/verifyAdOwnershipUseCase";
import { canManageAd } from "./canManageAd";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/integrations/ads/use-cases/verifyAdOwnershipUseCase", () => ({ verifyAdOwnershipUseCase: vi.fn() }));

describe("canManageAd", () => {
  beforeEach(() => vi.clearAllMocks());

  test("derives the actor from the current session and returns the authorized result", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "current-owner",
      email: "owner@example.com",
      emailVerified: true,
      isAdmin: false,
      isEditor: false,
    });

    await expect(canManageAd("ad-1")).resolves.toEqual({ status: "allowed" });
    expect(verifyAdOwnershipUseCase).toHaveBeenCalledWith({
      id: "ad-1",
      userId: "current-owner",
      isAdmin: false,
    });
  });

  test("correlates sanitized authority failures once and stays quiet for reported failures", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ uid: "holder", email: "private@example.com", emailVerified: true, isAdmin: false, isEditor: false });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(new ClassifiedsRequestError("unavailable", "worker-request"));
    await expect(canManageAd("private-ad")).resolves.toEqual({ status: "unavailable" });
    expect(log).toHaveBeenCalledTimes(1);
    const event = JSON.parse(log.mock.calls[0]![0]);
    expect(event).toMatchObject({ cause: "unavailable", requestId: "worker-request", service: "next", release: expect.any(String), environment: expect.any(String) });
    expect(log.mock.calls[0]![0]).not.toContain("private-ad");
    expect(log.mock.calls[0]![0]).not.toContain("private@example.com");
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(new ClassifiedsRequestError("unavailable", "worker-request", true));
    await expect(canManageAd("private-ad")).resolves.toEqual({ status: "unavailable" });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  test("retains validated authentication correlation without exception or session data", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const correlationId = "22222222-2222-4222-8222-222222222222";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("private@example.com session-secret"), {
      name: "TimeoutError", authenticationRequestId: requestId, authenticationCorrelationId: correlationId,
    });
    vi.mocked(getCurrentUser).mockRejectedValue(error);
    await expect(canManageAd("private-ad")).resolves.toEqual({ status: "unavailable" });
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ cause: "timeout", requestId, correlationId });
    expect(log.mock.calls[0]![0]).not.toMatch(/private|session-secret/);
    log.mockClear();
    vi.mocked(getCurrentUser).mockRejectedValue(Object.assign(error, { authenticationRequestId: "secret", authenticationCorrelationId: "secret" }));
    await canManageAd("private-ad");
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ operationId: expect.any(String) });
    expect(log.mock.calls[0]![0]).not.toContain("secret");
    log.mockRestore();
  });

  test("denies anonymous and non-owner sessions without exposing owner data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(canManageAd("ad-1")).resolves.toEqual({ status: "denied" });
    expect(verifyAdOwnershipUseCase).not.toHaveBeenCalled();

    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "former-owner",
      email: "former@example.com",
      emailVerified: true,
      isAdmin: false,
      isEditor: false,
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(new Error("Unauthorized"));
    await expect(canManageAd("ad-1")).resolves.toEqual({ status: "denied" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
