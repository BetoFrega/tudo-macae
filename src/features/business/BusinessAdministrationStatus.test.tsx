// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { BusinessAdministrationStatus } from "./BusinessAdministrationStatus";

test("distinguishes business-managed and public-information records", () => {
  const { rerender } = render(
    <BusinessAdministrationStatus isClaimable={false} badgeOnly />,
  );
  expect(screen.getByText("Administrado pelo negócio")).toBeInTheDocument();

  rerender(<BusinessAdministrationStatus isClaimable badgeOnly />);
  expect(screen.getByText("Informações públicas")).toBeInTheDocument();
  expect(screen.queryByText("Administrado pelo negócio")).not.toBeInTheDocument();
});

test("explains who maintains each kind of business record", () => {
  const { rerender } = render(
    <BusinessAdministrationStatus isClaimable />,
  );
  expect(screen.getByText(
    "Estas informações vêm de fontes públicas e ainda não são administradas pelo próprio negócio.",
  )).toBeInTheDocument();

  rerender(<BusinessAdministrationStatus isClaimable={false} />);
  expect(screen.getByText(
    "As informações e os contatos desta página são mantidos pelo responsável pelo negócio.",
  )).toBeInTheDocument();
});
