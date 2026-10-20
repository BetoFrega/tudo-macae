// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { beforeEach, expect, test, vi } from "vitest";
import { GlobalErrorView } from "./global-error";

const captureException = vi.hoisted(() => vi.fn());

vi.mock("posthog-js", () => ({
  default: { captureException },
}));

beforeEach(() => {
  captureException.mockReset();
});

test("a Server Action from another deployment reloads without showing the error modal", async () => {
  const error = Object.assign(new UnrecognizedActionError("Server Action was not found on the server."), { digest: "123456" });
  const reload = vi.fn();

  render(
    <GlobalErrorView
      error={error}
      retry={vi.fn()}
      reload={reload}
    />,
  );

  expect(screen.queryByRole("heading", { name: "Algo deu errado" }))
    .not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Atualizando a aplicação");
  expect(screen.queryByText("Referência do erro:")).not.toBeInTheDocument();
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(captureException).toHaveBeenCalledWith(error);
});

test("an unexpected error keeps the recoverable fallback", async () => {
  const error = new Error("Unexpected failure");
  const retry = vi.fn();
  const reload = vi.fn();

  render(<GlobalErrorView error={error} retry={retry} reload={reload} />);

  expect(screen.getByRole("heading", { name: "Algo deu errado" }))
    .toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tentar novamente" }))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(reload).not.toHaveBeenCalled();
  await waitFor(() => expect(captureException).toHaveBeenCalledWith(error));
});

test.each(["1", "123456", "12345678901234567890"])("shows the native numeric digest %s without exposing the exception", (digest) => {
  const error = Object.assign(new Error("private-error-sentinel"), { digest });

  render(<GlobalErrorView error={error} retry={vi.fn()} />);

  expect(screen.getByText("Referência do erro:")).toBeInTheDocument();
  expect(screen.getByText(digest, { selector: "code" })).toBeInTheDocument();
  expect(screen.queryByText("private-error-sentinel")).not.toBeInTheDocument();
});

test.each([undefined, "", "123456789012345678901", "private-error-sentinel", "123@E2", "123\n", "１２３"])("omits the reference for an absent or invalid digest %s", (digest) => {
  const error = digest === undefined
    ? new Error("private-error-sentinel")
    : Object.assign(new Error("private-error-sentinel"), { digest });

  render(<GlobalErrorView error={error} retry={vi.fn()} />);

  expect(screen.queryByText("Referência do erro:")).not.toBeInTheDocument();
  expect(screen.queryByText("private-error-sentinel")).not.toBeInTheDocument();
});

test("a new failure replaces the reference instead of retaining the previous error", () => {
  const retry = vi.fn();
  const first = Object.assign(new Error("first private error"), { digest: "123456" });
  const second = Object.assign(new Error("second private error"), { digest: "654321" });
  const { rerender } = render(<GlobalErrorView error={first} retry={retry} />);

  expect(screen.getByText(first.digest, { selector: "code" })).toBeInTheDocument();
  rerender(<GlobalErrorView error={second} retry={retry} />);
  expect(screen.queryByText(first.digest, { selector: "code" })).not.toBeInTheDocument();
  expect(screen.getByText(second.digest, { selector: "code" })).toBeInTheDocument();

  rerender(<GlobalErrorView error={new Error("no digest")} retry={retry} />);
  expect(screen.queryByText("Referência do erro:")).not.toBeInTheDocument();
  expect(screen.queryByText(second.digest, { selector: "code" })).not.toBeInTheDocument();
});
