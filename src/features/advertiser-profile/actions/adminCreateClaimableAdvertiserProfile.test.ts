import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  AdvertiserProfileAdministrationError,
  createAdvertiserProfileAdministrationUseCase,
} from "@/packages/classifieds-api";
import { adminCreateClaimableAdvertiserProfile } from "./adminCreateClaimableAdvertiserProfile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({
  AdvertiserProfileAdministrationError: class AdvertiserProfileAdministrationError extends Error {
    constructor(public code: string, message: string, public details: Record<string, unknown>) { super(message); }
  },
  createAdvertiserProfileAdministrationUseCase: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  unauthorized: () => { throw new Error("Unauthorized"); },
  forbidden: () => { throw new Error("Forbidden"); },
}));

function form(confirmDuplicate = false) {
  const data = new FormData();
  data.set("title", "Padaria Macaense");
  data.set("description", "Pães e café");
  data.set("contacts", JSON.stringify([{ number: "22999999999", isWhatsapp: true }]));
  data.set("activityAreas", JSON.stringify([{ categoryId: "servicos", subcategoryId: "alimentacao" }]));
  data.set("sourceUrl", "https://example.com/padaria");
  data.set("sourceCheckedAt", "123");
  data.set("idempotencyKey", "operation");
  if (confirmDuplicate) data.set("duplicateConfirmationToken", "token");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "admin",
    email: "admin@example.com",
    emailVerified: true,
    isAdmin: true,
    isEditor: false,
  });
  vi.mocked(createAdvertiserProfileAdministrationUseCase).mockResolvedValue({
    outcome: "created", replayed: false, profileId: "profile-id", revision: 1,
    effects: { previousActivityAreas: [], activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }] },
  });
});

test("returns duplicate candidates without creating until the administrator confirms", async () => {
  vi.mocked(createAdvertiserProfileAdministrationUseCase).mockRejectedValueOnce(
    new AdvertiserProfileAdministrationError("possibleDuplicate", "duplicate", {
      candidates: [{ id: "existing", title: "Padaria Macaense" }],
      confirmationToken: "token",
    }),
  );

  await expect(adminCreateClaimableAdvertiserProfile(form())).resolves.toEqual({
    success: false,
    duplicates: [{ id: "existing", title: "Padaria Macaense" }],
    confirmationToken: "token",
  });

  await expect(adminCreateClaimableAdvertiserProfile(form(true))).resolves.toEqual({
    success: true,
    profileId: "profile-id",
    revision: 1,
  });
  expect(createAdvertiserProfileAdministrationUseCase).toHaveBeenLastCalledWith({
    title: "Padaria Macaense",
    description: "Pães e café",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
    sourceUrl: "https://example.com/padaria",
    duplicateConfirmationToken: "token",
    idempotencyKey: "operation",
    actorId: "admin",
    channel: "administration",
  });
});

test.each([
  [null, "Unauthorized"],
  [{ uid: "user", email: "user@example.com", emailVerified: true, isAdmin: false, isEditor: false }, "Forbidden"],
] as const)("rejects callers without active administrator access", async (user, message) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  await expect(adminCreateClaimableAdvertiserProfile(form())).rejects.toThrow(message);
  expect(createAdvertiserProfileAdministrationUseCase).not.toHaveBeenCalled();
});
