// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Ad } from "../../../integrations/ads/use-cases/listAdsUseCase";
import { AdGrid } from "./AdGrid";
import { selectHomepageAds } from "./selectHomepageAds";

function anAd(index: number): Ad {
  return {
    id: `ad-${index}`,
    categoryId: "category",
    subcategoryId: "subcategory",
    advertiserProfileId: "advertiser",
    title: `Ad ${index}`,
    slug: `ad-${index}`,
    text: `Text ${index}`,
    userId: "user",
    status: "active",
    images: [],
    createdAt: 10 - index,
  };
}

describe("homepage ad selection", () => {
  it("shows four ads below desktop and adds the next two on desktop", () => {
    const selection = selectHomepageAds(Array.from({ length: 7 }, (_, index) => anAd(index + 1)));
    const { container } = render(<AdGrid {...selection} categories={[]} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent))
      .toEqual(["Ad 1", "Ad 2", "Ad 3", "Ad 4", "Ad 5", "Ad 6"]);

    const cards = container.querySelectorAll("[data-slot=\"card\"]");
    expect(cards).toHaveLength(6);
    expect(cards[3]).not.toHaveClass("hidden");
    expect(cards[4]).toHaveClass("hidden", "lg:flex");
    expect(cards[5]).toHaveClass("hidden", "lg:flex");
  });

  it("keeps every ad when fewer than either limit exist", () => {
    const selection = selectHomepageAds([anAd(1), anAd(2), anAd(3)]);
    const { container } = render(<AdGrid {...selection} categories={[]} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(container.querySelectorAll(".hidden")).toHaveLength(0);
  });
});
