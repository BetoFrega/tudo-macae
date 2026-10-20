// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BusinessResults } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "../IdentityIntegration";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test("business discovery requests avatar variants from the profile photo route through the application integration", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  const { container } = render(
    <IdentityIntegration>
      <BusinessResults
        initialPage={{ items: [{
          id: "shop",
          title: "Loja",
          description: "Comércio local",
          contacts: [],
          activityAreas: [],
          photoURL: "/api/classifieds/photos/public/profile-photos%2Fshop%2Fphoto.webp",
        }] }}
        categories={[]}
        source="business-directory"
      />
    </IdentityIntegration>,
  );
  const image = container.querySelector("img")!;
  expect(image.getAttribute("srcset")!.split(", ").map(candidate => candidate.split(" ")[0])).toEqual([
    "/api/classifieds/photos/public/profile-photos%2Fshop%2Fphoto.webp?w=64",
    "/api/classifieds/photos/public/profile-photos%2Fshop%2Fphoto.webp?w=128",
  ]);
  expect(image).toHaveAttribute("alt", "Loja");
});
