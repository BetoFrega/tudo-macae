// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { expect, test } from "vitest";
import { Form } from "@/components/ui/form";
import { AdvertiserProfileSharedFields, type AdvertiserProfileSharedValues } from "./AdvertiserProfileSharedFields";

const categories = [{ id: "services", name: "Serviços", isActive: true, subcategories: [{ id: "repair", name: "Reparos", isActive: true }] }];

function Fields() {
  const form = useForm<AdvertiserProfileSharedValues>({ defaultValues: { title: "Perfil", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [{ categoryId: "services", subcategoryId: "repair" }] } });
  return <Form {...form}><AdvertiserProfileSharedFields categories={categories} /></Form>;
}

test("keeps the responsive contact layout and accessible controls", () => {
  const { container } = render(<Fields />);
  expect([...container.querySelectorAll("div")].some(element => element.classList.contains("sm:grid-cols-[minmax(0,1fr)_auto_auto]"))).toBe(true);
  expect(screen.getByRole("checkbox", { name: "WhatsApp para contato 1" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Remover Contato" })).toBeInTheDocument();
  expect(screen.getByText("Serviços → Reparos")).toBeVisible();
  expect(screen.queryByText(/Sem contato, o cadastro fica salvo/)).not.toBeInTheDocument();
});
