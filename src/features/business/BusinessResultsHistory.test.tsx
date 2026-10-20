// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import { BusinessResults } from "./BusinessResults";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

function business(id: string, title: string): BusinessPublicData {
  return { id, title, contacts: [], activityAreas: [] };
}

test("keeps loaded batches when the renderer remounts the same list", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [business("c", "Casa Clara")] }),
  }));
  const user = userEvent.setup();
  const list = (subcategoryId: string, firstId = "a") => (
    <BusinessResults
      initialPage={{ items: [business(firstId, "Alfa"), business("b", "Beta")], nextCursor: "next-batch" }}
      categories={[]}
      source="catalog"
      subcategoryId={subcategoryId}
    />
  );

  render(list("repairs"));
  await user.click(screen.getByRole("button", { name: "Carregar mais negócios" }));
  expect(await screen.findByText("3 negócios exibidos")).toBeInTheDocument();
  cleanup();

  render(list("repairs"));
  expect(screen.getByText("3 negócios exibidos")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Carregar mais negócios" })).not.toBeInTheDocument();
  cleanup();

  render(list("cleaning"));
  expect(screen.getByText("2 negócios exibidos")).toBeInTheDocument();
  cleanup();

  // A first page that the kept batches no longer extend starts over.
  render(list("repairs", "replaced"));
  expect(screen.getByText("2 negócios exibidos")).toBeInTheDocument();
  vi.unstubAllGlobals();
});
