import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  AdvertiserProfileRevisionConflict,
  createAdvertiserProfileAdministrationUseCase,
  createAdvertiserProfileUseCase,
  getAdvertiserProfileUseCase,
  updateAdvertiserProfileUseCase,
  updateAdvertiserProfileAdministrationUseCase,
  verifyAdvertiserProfileOwnershipUseCase,
} from "@/packages/classifieds-api";
import { adminCreateClaimableAdvertiserProfile } from "./adminCreateClaimableAdvertiserProfile";
import { adminUpdateAdvertiserProfile } from "./adminUpdateAdvertiserProfile";
import { createAdvertiserProfile } from "./createAdvertiserProfile";
import { updateAdvertiserProfile } from "./updateAdvertiserProfile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  unauthorized: () => { throw new Error("Unauthorized"); },
  forbidden: () => { throw new Error("Forbidden"); },
}));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({
  AdvertiserProfileRevisionConflict: class AdvertiserProfileRevisionConflict extends Error {
    constructor(readonly currentRevision: number) { super("revision conflict"); }
  },
  AdvertiserProfileCreationPayloadConflict: class AdvertiserProfileCreationPayloadConflict extends Error {
    constructor(readonly profileId: string) { super("creation payload conflict"); }
  },
  createAdvertiserProfileUseCase: vi.fn(),
  updateAdvertiserProfileUseCase: vi.fn(),
  verifyAdvertiserProfileOwnershipUseCase: vi.fn(),
  getAdvertiserProfileUseCase: vi.fn(),
  createAdvertiserProfileAdministrationUseCase: vi.fn(),
  updateAdvertiserProfileAdministrationUseCase: vi.fn(),
}));

test("owner update returns a typed revision conflict without exposing the storage error", async () => {
  vi.mocked(updateAdvertiserProfileUseCase).mockRejectedValueOnce(new AdvertiserProfileRevisionConflict(3));
  await expect(updateAdvertiserProfile("profile", validForm())).resolves.toEqual({ success: false, outcome: "conflict", currentRevision: 3 });
});

function validForm() {
  const form = new FormData();
  form.set("title", "Padaria Macaense");
  form.set("description", "Pães e café");
  form.set("contacts", JSON.stringify([{ number: "22999999999", isWhatsapp: true }]));
  form.set("activityAreas", JSON.stringify([{ categoryId: "servicos", subcategoryId: "alimentacao" }]));
  form.set("sourceUrl", "https://example.com/padaria");
  form.set("expectedRevision", "1");
  form.set("idempotencyKey", "operation");
  form.set("identityType", "business");
  return form;
}

const operations = ["create", "update", "admin update", "claimable create"] as const;
type Operation = typeof operations[number];

function invokeOperation(name: Operation, form: FormData) {
  if (name === "create") return createAdvertiserProfile(form);
  if (name === "update") return updateAdvertiserProfile("profile", form);
  if (name === "admin update") return adminUpdateAdvertiserProfile("profile", form);
  return adminCreateClaimableAdvertiserProfile(form);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "admin", email: "admin@example.com", emailVerified: true, isAdmin: true, isEditor: false });
  vi.mocked(createAdvertiserProfileUseCase).mockResolvedValue("profile");
  vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockResolvedValue({ id: "profile", userId: "admin", activityAreas: [], revision: 1 } as never);
  vi.mocked(getAdvertiserProfileUseCase).mockResolvedValue({ id: "profile", userId: "owner", title: "Anterior", description: "", contacts: [], activityAreas: [], createdAt: 1, updatedAt: 1, revision: 1 });
  vi.mocked(createAdvertiserProfileAdministrationUseCase).mockResolvedValue({ profileId: "profile", revision: 1, effects: { previousActivityAreas: [], activityAreas: [] } } as never);
  vi.mocked(updateAdvertiserProfileAdministrationUseCase).mockResolvedValue({ profileId: "profile", revision: 2, effects: { previousActivityAreas: [], activityAreas: [] } } as never);
});

test.each(operations)("%s rejects malformed contact JSON before the mutation", async (name) => {
  const form = validForm();
  form.set("contacts", "{");
  await expect(invokeOperation(name, form)).rejects.toThrow("Contatos inválidos");
});

test.each(operations)("%s rejects a non-collection contact value", async (name) => {
  const form = validForm();
  form.set("contacts", JSON.stringify("22999999999"));
  await expect(invokeOperation(name, form)).rejects.toThrow();
});

test.each(operations)("%s accepts the canonical common fields", async (name) => {
  await expect(invokeOperation(name, validForm())).resolves.toBeDefined();
});

test("creation replay returns the persisted profile revision for photo upload", async () => {
  vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockResolvedValueOnce({ id: "profile", userId: "admin", revision: 3 } as never);

  await expect(createAdvertiserProfile(validForm())).resolves.toEqual({
    success: true,
    profileId: "profile",
    revision: 3,
  });
  expect(verifyAdvertiserProfileOwnershipUseCase).toHaveBeenCalledWith({ id: "profile", userId: "admin" });
});

test.each(operations)("%s rejects malformed activity-area JSON", async (name) => {
  const form = validForm();
  form.set("activityAreas", "{");
  await expect(invokeOperation(name, form)).rejects.toThrow("Áreas de atuação inválidos");
});

test.each(operations)("%s rejects activity areas with the wrong collection type", async (name) => {
  const form = validForm();
  form.set("activityAreas", JSON.stringify("alimentacao"));
  await expect(invokeOperation(name, form)).rejects.toThrow("Áreas de atuação inválidos");
});

test.each(operations)("%s rejects invalid collection members", async (name) => {
  for (const [field, value] of [
    ["contacts", [{ number: "inválido", isWhatsapp: true }]],
    ["activityAreas", [{ categoryId: "", subcategoryId: "alimentacao" }]],
  ] as const) {
    const form = validForm();
    form.set(field, JSON.stringify(value));
    await expect(invokeOperation(name, form)).rejects.toThrow();
  }
});

test.each(operations)("%s enforces canonical collection limits", async (name) => {
  const form = validForm();
  form.set("contacts", JSON.stringify(Array.from({ length: 4 }, (_, index) => ({
    number: `229999999${index}`,
    isWhatsapp: false,
  }))));
  await expect(invokeOperation(name, form)).rejects.toThrow("Máximo de 3 contatos");

  form.set("contacts", JSON.stringify([{ number: "22999999999", isWhatsapp: true }]));
  form.set("activityAreas", JSON.stringify(Array.from({ length: 4 }, (_, index) => ({
    categoryId: `category-${index}`,
    subcategoryId: `subcategory-${index}`,
  }))));
  await expect(invokeOperation(name, form)).rejects.toThrow();
});

test.each(operations)("%s rejects non-text title and description fields", async (name) => {
  for (const field of ["title", "description"] as const) {
    const form = validForm();
    form.set(field, new File(["value"], `${field}.txt`, { type: "text/plain" }));
    await expect(invokeOperation(name, form)).rejects.toThrow(
      field === "title" ? "Título inválido" : "Descrição inválido",
    );
  }
});

test("preserves operation-specific revision, idempotency, source and confirmation fields", async () => {
  const updateForm = validForm();
  await updateAdvertiserProfile("profile", updateForm);
  expect(vi.mocked(updateAdvertiserProfileUseCase)).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "profile", expectedRevision: 1 }),
  );

  vi.mocked(updateAdvertiserProfileUseCase).mockClear();
  await adminUpdateAdvertiserProfile("profile", updateForm);
  expect(vi.mocked(updateAdvertiserProfileUseCase)).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "profile", expectedRevision: 1 }),
  );

  const claimableForm = validForm();
  claimableForm.set("duplicateConfirmationToken", "confirmation");
  await adminCreateClaimableAdvertiserProfile(claimableForm);
  expect(vi.mocked(createAdvertiserProfileAdministrationUseCase)).toHaveBeenLastCalledWith(
    expect.objectContaining({
      actorId: "admin",
      channel: "administration",
      sourceUrl: "https://example.com/padaria",
      idempotencyKey: "operation",
      duplicateConfirmationToken: "confirmation",
    }),
  );
});

test.each([
  ["owner", updateAdvertiserProfile],
  ["administrator", adminUpdateAdvertiserProfile],
] as const)("%s update preserves omitted collections", async (_name, action) => {
  const form = validForm();
  form.delete("contacts");
  form.delete("activityAreas");

  await action("profile", form);

  const input = vi.mocked(updateAdvertiserProfileUseCase).mock.calls.at(-1)?.[0];
  expect(input).not.toHaveProperty("contacts");
  expect(input).not.toHaveProperty("activityAreas");
});

test("claimable administration preserves omitted collections in its patch", async () => {
  vi.mocked(getAdvertiserProfileUseCase).mockResolvedValue({
    id: "profile",
    claimable: true,
    source: { url: "https://example.com/profile", checkedAt: 1 },
    title: "Anterior",
    description: "",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "servicos", subcategoryId: "alimentacao" }],
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  });
  const form = validForm();
  form.delete("contacts");
  form.delete("activityAreas");

  await adminUpdateAdvertiserProfile("profile", form);

  const input = vi.mocked(updateAdvertiserProfileAdministrationUseCase).mock.calls[0]?.[0] as
    | { patch: Record<string, unknown> }
    | undefined;
  expect(input?.patch).not.toHaveProperty("contacts");
  expect(input?.patch).not.toHaveProperty("activityAreas");
});

test.each(operations)("%s preserves explicit empty collections", async (name) => {
  const form = validForm();
  form.set("contacts", "[]");
  form.set("activityAreas", "[]");

  await invokeOperation(name, form);

  const input = name === "create"
    ? vi.mocked(createAdvertiserProfileUseCase).mock.calls.at(-1)?.[0]
    : name === "claimable create"
      ? vi.mocked(createAdvertiserProfileAdministrationUseCase).mock.calls.at(-1)?.[0]
      : vi.mocked(updateAdvertiserProfileUseCase).mock.calls.at(-1)?.[0];
  expect(input).toEqual(expect.objectContaining({ contacts: [], activityAreas: [] }));
});
