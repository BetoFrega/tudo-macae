// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { AdvertiserProfileHeader } from "./AdvertiserProfileHeader";

// Keep the primitive wrapper lightweight; IdentityAvatar owns load readiness.
vi.mock("@tudomacae/react-primitives/avatar", () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

describe("AdvertiserProfileHeader", () => {
  const sourcePath = "/anunciante/profile-1";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the profile title when it is filled in", () => {
    render(
      <AdvertiserProfileHeader
        profile={{ id: "profile-1", title: "Loja do João" }}
        sourcePath={sourcePath}
      />,
    );

    expect(screen.getByText("Loja do João")).toBeInTheDocument();
  });

  it("keeps a long unspaced title readable without moving public details", () => {
    const title = "P".repeat(32);
    const { container } = render(
      <AdvertiserProfileHeader
        profile={{
          id: "profile-1",
          title,
          photoURL: "https://example.com/profile.jpg",
          isClaimable: true,
          contacts: [{ number: "22999999999", isWhatsapp: true }],
        }}
        sourcePath={sourcePath}
      />,
    );

    const avatar = container.querySelector("img") as HTMLImageElement;
    expect(avatar).toHaveAttribute("alt", title);
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img", { name: title })).not.toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: title });
    const publicNotice = screen.getByText("Informações públicas");
    const contact = screen.getByRole("link");

    expect(heading).toHaveClass("wrap-anywhere");
    expect(heading.parentElement).toHaveClass("min-w-0");
    expect(heading).toHaveTextContent(title);
    expect(avatar.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(publicNotice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(publicNotice.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("identifies the public profile as the WhatsApp contact source", () => {
    render(
      <AdvertiserProfileHeader
        profile={{
          id: "profile-1",
          title: "Loja do João",
          contacts: [{ number: "22999999999", isWhatsapp: true }],
        }}
        sourcePath={sourcePath}
      />,
    );

    const url = new URL(screen.getByRole("link").getAttribute("href")!);
    expect(url.searchParams.get("text")).toContain(
      "https://www.tudomacae.com.br/anunciante/profile-1",
    );
  });

  it("falls back to a readable title when the profile has no title", () => {
    render(
      <AdvertiserProfileHeader
        profile={{ id: "profile-1", title: "" }}
        sourcePath={sourcePath}
      />,
    );

    expect(screen.getByText("Anunciante sem nome")).toBeInTheDocument();
  });

  it("uses a non-empty alt on the avatar image when the profile has no title", () => {
    const { container } = render(
      <AdvertiserProfileHeader
        profile={{
          id: "profile-1",
          title: "",
          photoURL: "https://example.com/photo.jpg",
        }}
        sourcePath={sourcePath}
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute("alt", "Anunciante sem nome");
    expect(screen.queryByRole("img", { name: "Anunciante sem nome" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anunciante sem nome" })).toBeInTheDocument();
  });

  it("requests avatar candidates from the profile photo route", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(
      <AdvertiserProfileHeader
        profile={{
          id: "profile-1",
          title: "Loja",
          photoURL: "/api/classifieds/photos/public/profile-photos%2Fprofile-1%2Fphoto.webp",
        }}
        sourcePath={sourcePath}
      />,
    );

    expect(container.querySelector("img")?.getAttribute("srcset"))
      .toContain("/api/classifieds/photos/public/profile-photos%2Fprofile-1%2Fphoto.webp?w=");
    expect(screen.getByRole("heading", { name: "Loja" })).toBeInTheDocument();
  });

  it("explains when the profile contains public information not managed by the business", () => {
    render(
      <AdvertiserProfileHeader
        profile={{ id: "profile-1", title: "Padaria Macaense", isClaimable: true }}
        sourcePath={sourcePath}
      />,
    );

    expect(screen.getByText("Informações públicas")).toBeInTheDocument();
    expect(screen.getByText(
      "Estas informações vêm de fontes públicas. No momento, esta página não é administrada pelo próprio negócio.",
    )).toBeInTheDocument();
  });

  it("does not distinguish an ordinary owned profile", () => {
    render(
      <AdvertiserProfileHeader
        profile={{ id: "profile-1", title: "Loja própria" }}
        sourcePath={sourcePath}
      />,
    );
    expect(screen.queryByText("Informações públicas")).not.toBeInTheDocument();
  });
});
