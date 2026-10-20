import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/packages/editorial/publicBlogProduction", () => ({ readPublicBlogPage: mocks.page }));
vi.mock("@/integrations/public-images/editorial", () => ({ editorialListingLeadImageUrl: vi.fn(() => "/lead.webp") }));
vi.mock("@/integrations/public-images/EditorialImage", () => ({ EditorialImage: ({ alt }: { alt: string }) => <span data-alt={alt} /> }));
import BlogPage from "./page";

test("the public page renders each listed post with the lead Media it came with and links the next page", async () => {
  mocks.page.mockResolvedValue({
    items: [
      { id: "with-lead", title: "Com foto", slug: "com-foto", publishedAt: 1, lead: { id: "lead", alt: "Praia", caption: "Orla", credit: "Foto: Ana" } },
      { id: "plain", title: "Sem foto", slug: "sem-foto" },
    ],
    nextCursor: "plain",
  });
  const html = renderToStaticMarkup(await BlogPage({ searchParams: Promise.resolve({ cursor: "first" }) }));
  expect(mocks.page).toHaveBeenCalledWith("first");
  expect(html).toContain("href=\"/noticia/with-lead/com-foto\"");
  expect(html).toContain("data-alt=\"Praia\"");
  expect(html).toContain("Foto: Ana");
  expect(html.match(/data-alt=/g)).toHaveLength(1);
  expect(html).toContain("href=\"/noticias?cursor=plain\"");
});
