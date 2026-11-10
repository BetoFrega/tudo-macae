// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { BusinessClaimForm } from "./BusinessClaimForm";

const submit = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ submitBusinessClaim: submit }));

test("each invalid field is announced and tied to its message", async () => {
  submit.mockResolvedValueOnce({ status: "error", message: "Confira os campos do pedido.", fieldErrors: { cnpj: "Informe um CNPJ válido, com 14 dígitos." } });
  render(<BusinessClaimForm businessId="business" operationId="op-1" />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Seu nome"), "Ana");
  await user.type(screen.getByLabelText("CNPJ do negócio"), "123");
  await user.click(screen.getByRole("button", { name: "Enviar pedido" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Confira os campos do pedido.");
  const cnpj = screen.getByLabelText("CNPJ do negócio");
  expect(cnpj).toHaveAttribute("aria-invalid", "true");
  expect(cnpj).toHaveAccessibleDescription("Pode digitar com ou sem pontos, barra e traço. Informe um CNPJ válido, com 14 dígitos.");
  const form = submit.mock.calls[0]![2] as FormData;
  expect(Object.fromEntries(form)).toMatchObject({ operationId: "op-1", responsibleName: "Ana", cnpj: "123" });
  expect(submit.mock.calls[0]![0]).toBe("business");
});

test("a sent request confirms that the team will review it", async () => {
  submit.mockResolvedValueOnce({ status: "submitted" });
  render(<BusinessClaimForm businessId="business" operationId="op-1" />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Enviar pedido" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Pedido enviado. Vamos conferir as informações e avisar no e-mail da sua conta.");
});
