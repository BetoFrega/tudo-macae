import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ComponentProps } from "react";
import AdForm from "./AdForm";
import { AdFormProvider, type AdFormActions } from "../contexts/AdFormContext";
import { AuthContext } from "@/features/authentication/AuthContext";
import { LoginModalContext } from "@/features/authentication/LoginModalContext";
import type { Category } from "@tudomacae/categories/model";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";

export const mockProfiles: AdvertiserProfileData[] = [
  { id: "prof-1", title: "Profile 1", userId: "test-user", description: "Desc 1", createdAt: 100, updatedAt: 100 },
  { id: "prof-2", title: "Profile 2", userId: "test-user", description: "Desc 2", createdAt: 101, updatedAt: 101 },
];

export const mockCategories: Category[] = [
  {
    id: "cat-1",
    name: "Veículos",
    isActive: true,
    slug: "veiculos",
    order: 1,
    subcategories: [
      { id: "sub-1", name: "Carros", isActive: true, slug: "carros", order: 1 },
      { id: "sub-2", name: "Motos", isActive: true, slug: "motos", order: 2 },
    ],
  },
  {
    id: "cat-2",
    name: "Imóveis",
    isActive: true,
    slug: "imoveis",
    order: 2,
    subcategories: [], // Empty for testing
  },
];

export const mockActions: AdFormActions = {
  createAd: vi.fn().mockResolvedValue({ success: true, adId: "ad-new", slug: "novo-anuncio" }),
  updateAd: vi.fn().mockResolvedValue({ success: true, slug: "anuncio-atualizado" }),
  uploadAdImage: vi.fn().mockResolvedValue({ success: true }),
};

export const fakeAuthValue = {
  user: { uid: "test-user", email: "test@example.com" },
  isAdmin: false,
  isEditor: false,
  loading: false,
  logout: vi.fn(),
  login: vi.fn(),
};

export const fakeLoginModalValue = {
  openLoginModal: vi.fn(),
  closeLoginModal: vi.fn(),
  registerDefaultOnSuccess: () => () => undefined,
};

// Polyfills for Radix UI/JSDOM
export const installDomPolyfills = () => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
};

export const renderAdForm = (props: { initialData?: Exclude<ComponentProps<typeof AdForm>["initialData"], undefined>; adId?: string; profiles?: AdvertiserProfileData[]; profileManagementHref?: string } = {}) => {
  const { profiles = mockProfiles, profileManagementHref, ...adProps } = props;
  return render(
    <AuthContext.Provider value={fakeAuthValue}>
      <LoginModalContext.Provider value={fakeLoginModalValue}>
        <AdFormProvider
          profiles={profiles}
          categories={mockCategories}
          actions={mockActions}
          {...(profileManagementHref ? { profileManagementHref } : {})}
        >
          <AdForm {...adProps} />
        </AdFormProvider>
      </LoginModalContext.Provider>
    </AuthContext.Provider>,
  );
};
