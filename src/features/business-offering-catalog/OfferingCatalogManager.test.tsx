// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OfferingCatalogManager } from "./OfferingCatalogManager";
import { changeOfferingCatalog } from "./actions";
vi.mock("./actions", () => ({ changeOfferingCatalog: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test("source validation is associated with its input and saving announces progress", async () => {
  vi.mocked(changeOfferingCatalog).mockResolvedValue({ error: "Confira os campos do catálogo.", fieldErrors: { sourceUrl: "Informe uma fonte pública com URL HTTP ou HTTPS." } });
  render(<OfferingCatalogManager businessId="business" initial={{ enabled: false, revision: 0, items: [] }} admin />);
  fireEvent.change(screen.getByLabelText("Nome do item"), { target: { value: "Consulta" } });
  const button = screen.getByRole("button", { name: "Cadastrar item oculto" });
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(screen.getByLabelText("Fonte pública das informações")).toHaveAttribute("aria-invalid", "true"));
  expect(screen.getByLabelText("Fonte pública das informações")).toHaveAccessibleDescription("Informe uma fonte pública com URL HTTP ou HTTPS.");
  expect(screen.getByRole("status")).toHaveTextContent("Confira os campos do catálogo.");
});
test("saved items keep their controls separate from the new item form and editing is expandable", () => {
  render(<OfferingCatalogManager businessId="business" initial={{ enabled: false, revision: 1, items: [{ id: "consultation", name: "Consulta", description: "", price: { mode: "fixed", cents: 2500 }, visible: false }] }} admin={false} />);
  expect(screen.getByRole("heading", { name: "Consulta" })).toBeVisible();
  expect(screen.getByText("R$ 25,00")).toBeVisible();
  expect(screen.getByRole("button", { name: "Exibir item" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Salvar item" })).not.toBeVisible();
  fireEvent.click(screen.getByText("Editar item"));
  expect(screen.getByRole("button", { name: "Salvar item" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Cadastrar item oculto" })).toBeVisible();
  expect(screen.queryByLabelText("Fonte pública das informações")).not.toBeInTheDocument();
});

test("adding an item resets its form and moves focus to the success status", async () => {
  vi.mocked(changeOfferingCatalog).mockResolvedValue({ state: { enabled: false, revision: 1, items: [{ id: "consultation", name: "Consulta", description: "", price: { mode: "on_request" }, visible: false }] } });
  render(<OfferingCatalogManager businessId="business" initial={{ enabled: false, revision: 0, items: [] }} admin={false} />);
  fireEvent.change(screen.getByLabelText("Nome do item"), { target: { value: "Consulta" } });
  const button = screen.getByRole("button", { name: "Cadastrar item oculto" });
  button.focus();
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Item salvo."));
  await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
  expect(screen.getByLabelText("Nome do item", { selector: "#new-name" })).toHaveValue("");
});
