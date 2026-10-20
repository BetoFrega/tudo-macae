import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  AdvertiserIdentityTypeConflict,
  classifyAdvertiserProfileUseCase,
  createAdvertiserProfileUseCase,
} from "@/packages/classifieds-api";
import { classifyAdvertiserProfile } from "./classifyAdvertiserProfile";
import { createAdvertiserProfile } from "./createAdvertiserProfile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({
  AdvertiserProfileCreationPayloadConflict: class AdvertiserProfileCreationPayloadConflict extends Error {},
  AdvertiserIdentityTypeConflict: class AdvertiserIdentityTypeConflict extends Error {
    constructor(readonly reason: string) { super(reason); }
  },
  classifyAdvertiserProfileUseCase: vi.fn(),
  createAdvertiserProfileUseCase: vi.fn(),
  verifyAdvertiserProfileOwnershipUseCase: vi.fn(async () => ({ revision: 1 })),
}));

function form(identityType?: string) {
  const value = new FormData();
  value.set("title", "Ana");
  value.set("contacts", "[]");
  if (identityType !== undefined) value.set("identityType", identityType);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "owner", email: "owner@example.com", emailVerified: true, isAdmin: false, isEditor: false });
  vi.mocked(createAdvertiserProfileUseCase).mockResolvedValue("profile");
});

test("creation requires and forwards an explicit type", async () => {
  await expect(createAdvertiserProfile(form())).rejects.toThrow();
  await createAdvertiserProfile(form("personal"));

  expect(createAdvertiserProfileUseCase).toHaveBeenCalledOnce();
  expect(createAdvertiserProfileUseCase).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", identityType: "personal" }));
});

test("a second personal profile becomes a recoverable outcome", async () => {
  vi.mocked(createAdvertiserProfileUseCase).mockRejectedValueOnce(new AdvertiserIdentityTypeConflict("personal-exists"));

  await expect(createAdvertiserProfile(form("personal"))).resolves.toEqual({ success: false, outcome: "personal_exists" });
});

test("classification forwards the type and reports conflicts", async () => {
  await expect(classifyAdvertiserProfile("profile", "business")).resolves.toEqual({ success: true });
  expect(classifyAdvertiserProfileUseCase).toHaveBeenCalledWith({ id: "profile", userId: "owner", identityType: "business" });

  vi.mocked(classifyAdvertiserProfileUseCase).mockRejectedValueOnce(new AdvertiserIdentityTypeConflict("already-classified"));
  await expect(classifyAdvertiserProfile("profile", "personal")).resolves.toEqual({ success: false, outcome: "already_classified" });

  await expect(classifyAdvertiserProfile("profile", "other" as never)).rejects.toThrow();
});
