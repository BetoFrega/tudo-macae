// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PublicInformationNotice } from "./PublicInformationNotice";

test("keeps catalog cards compact while preserving the public-information disclosure", () => {
  render(<PublicInformationNotice badgeOnly />);

  expect(screen.getByText("Informações públicas")).toBeInTheDocument();
  expect(screen.queryByText(/fontes públicas/u)).not.toBeInTheDocument();
});

test("explains the disclosure on the individual business page", () => {
  render(<PublicInformationNotice />);

  expect(screen.getByText(
    "Estas informações vêm de fontes públicas. No momento, esta página não é administrada pelo próprio negócio.",
  )).toBeInTheDocument();
});
