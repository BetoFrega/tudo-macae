// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
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
  mocks.create.mockResolvedValue({ success: true, profileId: "profile-1", revision: 1 });
  mocks.update.mockResolvedValue({ success: true, revision: 2 });
});

test("keeps selected activity areas while choosing another category", async () => {
  const user = userEvent.setup();
  render(
    <AdvertiserProfileForm
      categories={[
        ...categories,
        {
          id: "other",
          name: "Outros",
          isActive: true,
          subcategories: [
            { id: "other-subcategory", name: "Aulas", isActive: true },
          ],
        },
      ]}
    />,
  );
  await user.selectOptions(
    screen.getByLabelText("Categoria da área de atuação"),
    "category",
  );
  await user.selectOptions(
    screen.getByLabelText("Subcategoria da área de atuação"),
    "subcategory",
  );
  await user.click(screen.getByRole("button", { name: "Adicionar área" }));
  await user.selectOptions(
    screen.getByLabelText("Categoria da área de atuação"),
    "other",
  );
  expect(screen.getByText("Serviços → Reparos")).toBeVisible();
  expect(screen.getByText("1 de 3")).toBeVisible();
});

test("requires a complete pending area to be added before saving", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} />);
  await user.type(screen.getByLabelText("Título do Perfil"), "Perfil com área");
  await user.selectOptions(screen.getByLabelText("Categoria da área de atuação"), "category");
  await user.selectOptions(screen.getByLabelText("Subcategoria da área de atuação"), "subcategory");

  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));
  expect(mocks.create).not.toHaveBeenCalled();
  expect(screen.getByText("Clique em Adicionar área para incluir a seleção antes de salvar.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Adicionar área" })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Adicionar área" }));
  expect(screen.queryByText("Clique em Adicionar área para incluir a seleção antes de salvar.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  const submitted = vi.mocked(mocks.create).mock.calls.at(-1)?.[0] as FormData;
  expect(JSON.parse(String(submitted.get("activityAreas")))).toEqual([{ categoryId: "category", subcategoryId: "subcategory" }]);
});

test("allows a partial draft with only a category selected", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} />);
  await user.type(screen.getByLabelText("Título do Perfil"), "Perfil parcial");
  await user.selectOptions(screen.getByLabelText("Categoria da área de atuação"), "category");
  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  const submitted = vi.mocked(mocks.create).mock.calls.at(-1)?.[0] as FormData;
  expect(JSON.parse(String(submitted.get("activityAreas")))).toEqual([]);
});

test("does not block saving an area already added when it is selected again", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} initialData={{ title: "Perfil", activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }] }} profileId="profile-1" />);
  await user.selectOptions(screen.getByLabelText("Categoria da área de atuação"), "category");
  await user.selectOptions(screen.getByLabelText("Subcategoria da área de atuação"), "subcategory");
  expect(screen.getByText("Esta área já foi adicionada. Escolha outra subcategoria.")).toBeVisible();
  expect(screen.getByLabelText("Subcategoria da área de atuação")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Subcategoria da área de atuação")).toHaveAttribute("aria-describedby", "activity-area-duplicate-error");
  expect(screen.getByRole("button", { name: "Adicionar área" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
});

test("requires adding a previously duplicate selection after removing its area", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} initialData={{ title: "Perfil", activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }] }} profileId="profile-1" />);
  await user.selectOptions(screen.getByLabelText("Categoria da área de atuação"), "category");
  await user.selectOptions(screen.getByLabelText("Subcategoria da área de atuação"), "subcategory");
  await user.click(screen.getByRole("button", { name: "Remover área de atuação" }));
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Adicionar área" })).toHaveFocus();
});

test("requires an unavailable activity area to be removed before saving", async () => {
  const user = userEvent.setup();
  render(
    <AdvertiserProfileForm
      categories={[
        {
          ...categories[0],
          subcategories: [
            { ...categories[0].subcategories[0], isActive: false },
          ],
        },
      ]}
      profileId="profile-1"
      initialData={{
        title: "Anunciante",
        description: "Descrição preservada",
        contacts: [{ number: "22999999999", isWhatsapp: true }],
        activityAreas: [
          { categoryId: "category", subcategoryId: "subcategory" },
        ],
      }}
    />,
  );

  expect(screen.getByText("Área de atuação indisponível")).toBeVisible();
  expect(
    screen.getByText("Remova ou substitua as áreas indisponíveis antes de salvar."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Remover área de atuação" }));

  expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeEnabled();
  expect(screen.getByLabelText("Descrição (Opcional)")).toHaveValue(
    "Descrição preservada",
  );
});

test("marks an area unavailable when its category is inactive", () => {
  render(
    <AdvertiserProfileForm
      categories={[{ ...categories[0], isActive: false }]}
      profileId="profile-1"
      initialData={{ title: "Anunciante", activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }] }}
    />,
  );
  expect(screen.getByText("Área de atuação indisponível")).toBeVisible();
});
