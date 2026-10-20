// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicAdvertiserProfileData } from "@tudomacae/advertiser-identity/model";

const getPublicAdvertiserProfile = vi.fn();
const getBusinessUseCase = vi.fn();

vi.mock(
  "@/features/advertiser-profile/actions/getPublicAdvertiserProfile",
  () => ({
    getPublicAdvertiserProfile: (profileId: string) =>
      getPublicAdvertiserProfile(profileId),
  }),
);

vi.mock("@/packages/classifieds-api", () => ({
  getBusinessUseCase: (input: { id: string }) => getBusinessUseCase(input),
}));

// Keep the primitive wrapper lightweight; IdentityAvatar owns load readiness.
vi.mock("@tudomacae/react-primitives/avatar", () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const { AdvertiserProfileAside } = await import("./AdvertiserProfileAside");

async function renderAside(profile: PublicAdvertiserProfileData | null) {
  getPublicAdvertiserProfile.mockResolvedValue(profile);
  getBusinessUseCase.mockResolvedValue(null);
  return render(await AdvertiserProfileAside({
    profileId: "profile-1",
    sourcePath: "/anuncio/ad-1/bicicleta",
  }));
}

describe("AdvertiserProfileAside", () => {
  beforeEach(() => {
    getPublicAdvertiserProfile.mockReset();
    getBusinessUseCase.mockReset();
  });

  it("renders the profile title when it is filled in", async () => {
    await renderAside({ id: "profile-1", title: "Loja do João" });

    expect(screen.getByText("Loja do João")).toBeInTheDocument();
  });

  it("identifies the ad as the WhatsApp contact source", async () => {
    await renderAside({
      id: "profile-1",
      title: "Loja do João",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
    });

    const contactLink = screen.getByRole("link", { name: /WhatsApp/ });
    const url = new URL(contactLink.getAttribute("href")!);
    expect(url.searchParams.get("text")).toContain(
      "https://www.tudomacae.com.br/anuncio/ad-1/bicicleta",
    );
  });

  it("falls back to a readable title when the profile has no title", async () => {
    await renderAside({ id: "profile-1", title: "" });

    expect(screen.getByText("Anunciante sem nome")).toBeInTheDocument();
  });

  it("uses a non-empty alt on the avatar image when the profile has no title", async () => {
    const { container } = await renderAside({
      id: "profile-1",
      title: "",
      photoURL: "https://example.com/photo.jpg",
    });

    expect(container.querySelector("img")).toHaveAttribute("alt", "Anunciante sem nome");
    expect(screen.queryByRole("img", { name: "Anunciante sem nome" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anunciante sem nome" })).toBeInTheDocument();
  });

  it("discloses public information for a claimable profile", async () => {
    await renderAside({ id: "profile-1", title: "Loja", isClaimable: true });
    expect(screen.getByText("Informações públicas")).toBeInTheDocument();
    expect(screen.getByText(/esta página não é administrada pelo próprio negócio/)).toBeInTheDocument();
  });

  it("links an eligible business to its canonical route", async () => {
    getBusinessUseCase.mockResolvedValue({
      id: "profile-1",
      title: "Loja do João",
      activityAreas: [{ categoryId: "shops", subcategoryId: "local" }],
    });
    getPublicAdvertiserProfile.mockResolvedValue({ id: "profile-1", title: "Loja do João" });
    render(await AdvertiserProfileAside({
      profileId: "profile-1",
      sourcePath: "/anuncio/ad-1/bicicleta",
    }));
    expect(screen.getByRole("link", { name: "Ver negócio completo" })).toHaveAttribute(
      "href",
      "/negocio/profile-1/loja-do-joao",
    );
  });
});
