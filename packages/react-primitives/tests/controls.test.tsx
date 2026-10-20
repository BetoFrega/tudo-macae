// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Button } from "../button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "../sheet";

test("a button delegates to its link and preserves accessible keyboard operation", async () => {
  const user = userEvent.setup();
  const activate = vi.fn((event: React.MouseEvent) => event.preventDefault());
  render(<Button asChild variant="highlight"><a href="/publicar" onClick={activate}>Anunciar grátis</a></Button>);
  await user.tab();
  expect(screen.getByRole("link", { name: "Anunciar grátis" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(activate).toHaveBeenCalledOnce();
});

test("a sheet exposes its name and restores trigger focus after keyboard dismissal", async () => {
  const user = userEvent.setup();
  render(
    <Sheet>
      <SheetTrigger asChild><Button>Explorar</Button></SheetTrigger>
      <SheetContent closeLabel="Fechar menu">
        <SheetTitle>Mapa do site</SheetTitle>
        <SheetDescription>Explore o Tudo Macaé</SheetDescription>
      </SheetContent>
    </Sheet>,
  );
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "Mapa do site" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Explorar" })).toHaveFocus();
});
