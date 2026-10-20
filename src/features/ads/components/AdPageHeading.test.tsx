// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { AdPageHeading } from "./AdPageHeading";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});
const heading = (cursor?: string, invalidCursor = false) => (
  <AdPageHeading id="ads-title" className="text-xl" cursor={cursor} invalidCursor={invalidCursor}>Anúncios deste negócio</AdPageHeading>
);

test("keeps ordinary page entry from taking focus", () => {
  render(heading());
  expect(screen.getByRole("heading", { name: "Anúncios deste negócio" })).not.toHaveFocus();
});

test("focuses the displayed page heading after anchored continuation changes", () => {
  window.location.hash = "anuncios";
  const view = render(
    <>
      <button>Mais anúncios</button>
      {heading("first")}
    </>,
  );
  const more = screen.getByRole("button", { name: "Mais anúncios" });
  more.focus();
  view.rerender(
    <>
      <button>Mais anúncios</button>
      {heading("second")}
    </>,
  );
  expect(screen.getByRole("heading", { name: "Anúncios deste negócio" })).toHaveFocus();
});

test("restores focus when an invalid non-string cursor is recovered", () => {
  window.location.hash = "anuncios";
  const view = render(
    <>
      <button>Voltar</button>
      {heading(undefined, true)}
    </>,
  );
  screen.getByRole("button", { name: "Voltar" }).focus();
  view.rerender(heading(undefined, false));
  expect(screen.getByRole("heading", { name: "Anúncios deste negócio" })).toHaveFocus();
});
