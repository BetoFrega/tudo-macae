// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AdCard, AdCardProps } from "./AdCard";

describe("AdCard", () => {
  let defaultProps: AdCardProps;
  beforeEach(() => {
    defaultProps = {
      id: "1",
      title: "Test Ad",
      slug: "test-ad",
      categoryId: "cat-1",
      categoryName: "Category 1",
      categorySlug: "cat-1-slug",
      subcategoryId: "sub-1",
      subcategoryName: "Subcategory 1",
      subcategorySlug: "sub-1-slug",
      text: "This is a test ad description",
      createdAt: 1733948835000, // Fixed timestamp for consistency if needed, though we check date string formatting
      imageUrl: "https://example.com/image.jpg",
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders ad details correctly", () => {
    render(<AdCard {...defaultProps} />);

    expect(screen.getByText("Test Ad")).toBeInTheDocument();
    expect(screen.getByText("Category 1")).toBeInTheDocument();
    expect(screen.getByText("Subcategory 1")).toBeInTheDocument();
    expect(screen.getByText("This is a test ad description")).toBeInTheDocument();
  });

  it("writes the publication day as dd/mm/yyyy in Macaé", () => {
    render(<AdCard {...defaultProps} createdAt={Date.parse("2026-10-13T02:00:00.000Z")} />);

    expect(screen.getByText("12/10/2026")).toBeInTheDocument();
  });

  it("renders links correctly", () => {
    render(<AdCard {...defaultProps} />);

    const adLinks = screen.getAllByRole("link", { name: /Test Ad/i });

    const linkHrefs = adLinks.map(l => l.getAttribute("href"));
    expect(linkHrefs).toContain("/anuncio/1/test-ad");

    // Check category link
    const categoryLinks = screen.getAllByRole("link", { name: /Category 1/i });
    expect(categoryLinks.length).toBeGreaterThan(0);
    expect(categoryLinks[0]).toHaveAttribute("href", "/categoria/cat-1/cat-1-slug");

    // Check subcategory link
    const subcategoryLink = screen.getByRole("link", { name: /Subcategory 1/i });
    expect(subcategoryLink).toHaveAttribute("href", "/categoria/cat-1/cat-1-slug/sub-1/sub-1-slug");
  });

  it("renders \"Sem foto\" when no image provided", () => {
    const { imageUrl, ...propsNoImage } = defaultProps;
    render(<AdCard {...propsNoImage} />);
    expect(screen.getByText("Sem foto")).toBeInTheDocument();
  });

  it("requests responsive card candidates from the ad photo route", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(
      <AdCard
        {...defaultProps}
        imageUrl="/api/anuncios/ad-1/fotos/photo"
      />,
    );

    const image = screen.getByRole("img", { name: "Test Ad" });
    expect(image.getAttribute("srcset")).toContain("/api/anuncios/ad-1/fotos/photo?w=");
    expect(image).toHaveAttribute("sizes", "(min-width: 768px) 370px, 95vw");
  });
});
