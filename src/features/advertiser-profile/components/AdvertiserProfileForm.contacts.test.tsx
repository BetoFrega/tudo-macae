// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import AdvertiserProfileForm from "./AdvertiserProfileForm";
import { categories, installResizeObserver } from "./AdvertiserProfileForm.fixtures";

const mocks = vi.hoisted(() => ({ push: vi.fn(), update: vi.fn(), create: vi.fn(), upload: vi.fn(), capture: vi.fn(), reminder: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../actions/updateAdvertiserProfile", () => ({
  updateAdvertiserProfile: mocks.update,
}));
vi.mock("../actions/createAdvertiserProfile", () => ({
  createAdvertiserProfile: mocks.create,
}));
vi.mock("../actions/classifyAdvertiserProfile", () => ({
  classifyAdvertiserProfile: vi.fn(),
}));
vi.mock("../actions/uploadProfilePhoto", () => ({
  uploadProfilePhoto: mocks.upload,
}));
vi.mock("@tudomacae/media/imageProcessing", () => ({
  validateImageFile: vi.fn(),
  processImage: vi.fn(),
  VALID_IMAGE_TYPES_ACCEPT: "image/*",
}));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));
vi.mock("@/features/authentication/accountReminderEvents", () => ({ notifyAccountReminderChanged: mocks.reminder }));

installResizeObserver();

beforeEach(() => {
  vi.clearAllMocks();
});

test("starts a business with an optional telephone field and WhatsApp off", async () => {
  mocks.create.mockResolvedValue({ success: true, profileId: "business-1", revision: 1 });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);

  const phone = screen.getByRole("textbox", { name: "Número de contato 1" });
  expect(phone).toHaveValue("");
  expect(phone).toHaveAttribute("type", "tel");
  expect(phone).toHaveAttribute("inputmode", "tel");
  expect(phone).toHaveAttribute("autocomplete", "tel");
  expect(screen.getByRole("checkbox", { name: "WhatsApp para contato 1" })).not.toBeChecked();
  expect(screen.getByText(/Sem contato, o cadastro fica salvo/)).toBeVisible();

  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "Oficina do Bairro");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));

  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  const formData = mocks.create.mock.calls[0][0] as FormData;
  expect(formData.get("contacts")).toBe("[]");
});

test("normalizes telephone autofill to the national number", () => {
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  const phone = screen.getByRole("textbox", { name: "Número de contato 1" });
  for (const [input, shown] of [
    ["+55 (22) 99999-9999", "(22) 99999-9999"],
    ["+552233334444", "(22) 3333-4444"],
    ["552233334444", "(22) 3333-4444"],
  ]) {
    fireEvent.change(phone, { target: { value: input } });
    expect(phone).toHaveValue(shown);
  }
});

test("accepts a Brazilian landline with country code typed one character at a time", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  const phone = screen.getByRole("textbox", { name: "Número de contato 1" });
  await user.type(phone, "+552233334444");
  expect(phone).toHaveValue("(22) 3333-4444");
});

test("keeps each phone and WhatsApp choice separate", async () => {
  mocks.create.mockResolvedValue({ success: true, profileId: "business-2", revision: 1 });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);

  const first = screen.getByRole("textbox", { name: "Número de contato 1" });
  fireEvent.change(first, { target: { value: "+55" } });
  expect(first).toHaveValue("+55");
  fireEvent.change(first, { target: { value: "+5522999999999" } });
  await user.click(screen.getByRole("button", { name: "Adicionar Contato" }));
  await user.type(screen.getByRole("textbox", { name: "Número de contato 2" }), "22888888888");
  await user.click(screen.getByRole("checkbox", { name: "WhatsApp para contato 2" }));

  expect(screen.getByRole("textbox", { name: "Número de contato 1" })).toHaveValue("(22) 99999-9999");
  expect(screen.getByRole("checkbox", { name: "WhatsApp para contato 1" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "WhatsApp para contato 2" })).toBeChecked();

  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "Oficina do Bairro");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  const formData = mocks.create.mock.calls[0][0] as FormData;
  expect(JSON.parse(formData.get("contacts") as string)).toEqual([
    { number: "22999999999", isWhatsapp: false },
    { number: "22888888888", isWhatsapp: true },
  ]);
});

test("omits an empty first contact when a later contact is filled", async () => {
  mocks.create.mockResolvedValue({ success: true, profileId: "business-2", revision: 1 });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);

  await user.click(screen.getByRole("button", { name: "Adicionar Contato" }));
  await user.type(screen.getByRole("textbox", { name: "Número de contato 2" }), "22888888888");
  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "Oficina do Bairro");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));

  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  const formData = mocks.create.mock.calls[0][0] as FormData;
  expect(JSON.parse(formData.get("contacts") as string)).toEqual([
    { number: "22888888888", isWhatsapp: false },
  ]);
});

test("associates an invalid later phone with its original row", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  await user.click(screen.getByRole("button", { name: "Adicionar Contato" }));
  const first = screen.getByRole("textbox", { name: "Número de contato 1" });
  const second = screen.getByRole("textbox", { name: "Número de contato 2" });
  await user.type(second, "123");
  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "Oficina do Bairro");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));

  const error = await screen.findByText(/Telefone inválido/);
  expect(screen.getByRole("alert", { name: "" })).toHaveTextContent("Número de contato 2");
  expect(second.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  expect(second).toHaveAttribute("aria-invalid", "true");
  expect(first).not.toHaveAttribute("aria-invalid", "true");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(second).toHaveFocus();
  await user.click(screen.getAllByRole("button", { name: "Remover Contato" })[1]!);
  expect(screen.queryByText(/Confira os campos:/)).not.toBeInTheDocument();
});
