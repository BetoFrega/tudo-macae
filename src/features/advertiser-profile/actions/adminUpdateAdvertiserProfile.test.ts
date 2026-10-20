import { beforeEach, expect, test, vi } from "vitest";
import { revalidateTag, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adminUpdateAdvertiserProfile } from "./adminUpdateAdvertiserProfile";
import {
  getAdvertiserProfileUseCase,
  updateAdvertiserProfileUseCase,
  updateAdvertiserProfileAdministrationUseCase,
} from "@/packages/classifieds-api";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/packages/classifieds-api", () => ({
  getAdvertiserProfileUseCase: vi.fn(),
  updateAdvertiserProfileUseCase: vi.fn(),
  updateAdvertiserProfileAdministrationUseCase: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unauthorized: () => { throw new Error("Unauthorized"); },
  forbidden: () => { throw new Error("Forbidden"); },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "admin", email: "admin@example.com", emailVerified: true, isAdmin: true, isEditor: false,
  });
  vi.mocked(getAdvertiserProfileUseCase).mockResolvedValue({
    id: "profile", userId: "owner", title: "Anterior", description: "",
    contacts: [], activityAreas: [], createdAt: 1, updatedAt: 1,
    revision: 1,
  });
  vi.mocked(updateAdvertiserProfileAdministrationUseCase).mockResolvedValue({
    outcome: "updated", replayed: false, profileId: "profile", revision: 2,
    effects: { previousActivityAreas: [], activityAreas: [] },
  });
});

test.each([undefined, "", "Descrição preenchida"])("admin saves another person's profile with description %s", async (description) => {
  const form = new FormData();
  form.set("title", "Perfil atualizado");
  form.set("contacts", "[]");
  if (description !== undefined) form.set("description", description);
  await expect(adminUpdateAdvertiserProfile("profile", form)).resolves.toEqual({ success: true, revision: 2 });
  expect(updateTag).toHaveBeenCalledWith("advertiser-profile-profile");
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(updateAdvertiserProfileUseCase).toHaveBeenCalledWith({ id: "profile",
    title: "Perfil atualizado", description: description ?? "", contacts: [],
  });
});

test("rejects an unauthenticated caller without writing", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  await expect(adminUpdateAdvertiserProfile("profile", new FormData())).rejects.toThrow("Unauthorized");
  expect(updateAdvertiserProfileUseCase).not.toHaveBeenCalled();
});

test("rejects a non-admin caller without writing", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "owner", email: "owner@example.com", emailVerified: true, isAdmin: false, isEditor: false,
  });
  await expect(adminUpdateAdvertiserProfile("profile", new FormData())).rejects.toThrow("Forbidden");
  expect(updateAdvertiserProfileUseCase).not.toHaveBeenCalled();
});

test("refreshes source evidence when an administrator edits a claimable profile", async () => {
  vi.mocked(getAdvertiserProfileUseCase).mockResolvedValue({
    id: "profile",
    claimable: true,
    source: { url: "https://example.com/old", checkedAt: 1 },
    title: "Anterior",
    description: "",
    contacts: [{ number: "22999999999", isWhatsapp: false }],
    activityAreas: [{ categoryId: "services", subcategoryId: "food" }],
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  });
  const form = new FormData();
  form.set("title", "Perfil atualizado");
  form.set("contacts", JSON.stringify([{ number: "22999999999", isWhatsapp: true }]));
  form.set("activityAreas", JSON.stringify([{ categoryId: "services", subcategoryId: "food" }]));
  form.set("sourceUrl", "https://example.com/new");
  form.set("verifySource", "true");
  form.set("expectedRevision", "1");
  form.set("idempotencyKey", "operation");

  await expect(adminUpdateAdvertiserProfile("profile", form)).resolves.toEqual({ success: true, revision: 2 });
  expect(updateAdvertiserProfileAdministrationUseCase).toHaveBeenCalledWith({
    id: "profile",
    expectedRevision: 1,
    idempotencyKey: "operation",
    actorId: "admin",
    channel: "administration",
    patch: {
      title: "Perfil atualizado", description: "",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: "services", subcategoryId: "food" }],
    },
    verifySource: { url: "https://example.com/new" },
  });
  expect(updateAdvertiserProfileUseCase).not.toHaveBeenCalled();
});
