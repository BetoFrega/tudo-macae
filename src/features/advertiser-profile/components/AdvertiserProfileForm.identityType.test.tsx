// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import AdvertiserProfileForm from "./AdvertiserProfileForm";
import { categories, installResizeObserver } from "./AdvertiserProfileForm.fixtures";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), create: vi.fn(), classify: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("../actions/updateAdvertiserProfile", () => ({ updateAdvertiserProfile: vi.fn() }));
vi.mock("../actions/createAdvertiserProfile", () => ({ createAdvertiserProfile: mocks.create }));
vi.mock("../actions/classifyAdvertiserProfile", () => ({ classifyAdvertiserProfile: mocks.classify }));
vi.mock("../actions/uploadProfilePhoto", () => ({ uploadProfilePhoto: vi.fn() }));
vi.mock("@tudomacae/media/imageProcessing", () => ({
  validateImageFile: vi.fn(),
  processImage: vi.fn(),
  VALID_IMAGE_TYPES_ACCEPT: "image/*",
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@/features/authentication/accountReminderEvents", () => ({ notifyAccountReminderChanged: vi.fn() }));

installResizeObserver();

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Título do Perfil" }), "Ana");
  await user.type(screen.getByRole("textbox", { name: "Número de contato 1" }), "22999999999");
}

test("creation requires an explicit type and sends it", async () => {
  mocks.create.mockResolvedValue({ success: true, profileId: "profile", revision: 1 });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} identityTypes={{ personalAvailable: true }} />);
  await fillProfile(user);
  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));

  expect(screen.getByText("Escolha se este perfil é pessoal ou de um negócio.")).toBeVisible();
  expect(screen.getByRole("radio", { name: "Meu perfil pessoal" })).toHaveFocus();
  expect(mocks.create).not.toHaveBeenCalled();

  await user.click(screen.getByRole("radio", { name: "Meu perfil pessoal" }));
  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect((mocks.create.mock.calls[0][0] as FormData).get("identityType")).toBe("personal");
});

test("a concurrent personal profile keeps the data and leaves only the business choice", async () => {
  mocks.create.mockResolvedValue({ success: false, outcome: "personal_exists" });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} identityTypes={{ personalAvailable: true }} />);
  await fillProfile(user);
  await user.click(screen.getByRole("radio", { name: "Meu perfil pessoal" }));
  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));

  expect(await screen.findByText(/Sua conta já tem um perfil pessoal. Seus dados continuam aqui/)).toBeVisible();
  expect(screen.getByRole("radio", { name: "Meu perfil pessoal" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Título do Perfil" })).toHaveValue("Ana");
});

test("an untyped profile is classified by a separate action", async () => {
  mocks.classify.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm profileId="profile" initialData={{ title: "Ana", revision: 3 }} categories={categories} identityTypes={{ personalAvailable: false }} />);

  expect(screen.getByRole("radio", { name: "Meu perfil pessoal" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: "Um negócio" }));
  await user.click(screen.getByRole("button", { name: "Definir tipo" }));

  await waitFor(() => expect(mocks.classify).toHaveBeenCalledWith("profile", "business"));
  expect(screen.queryByRole("button", { name: "Definir tipo" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Um negócio");
  expect(screen.getByRole("status")).toHaveFocus();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

test("a classified profile shows its fixed type without a choice", () => {
  render(<AdvertiserProfileForm profileId="profile" initialData={{ title: "Ana", revision: 3 }} categories={categories} identityTypes={{ current: "personal", personalAvailable: true }} />);

  expect(screen.getByText("Meu perfil pessoal")).toBeVisible();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});
