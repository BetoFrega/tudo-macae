import { AdFormProvider } from "@/features/ads/contexts/AdFormContext";
import { AuthContext } from "@/features/authentication/AuthContext";
import { LoginModalContext } from "@/features/authentication/LoginModalContext";
import type { useAdFormLogic } from "./useAdFormLogic";
import { vi } from "vitest";

export const mockRouterPush = vi.fn();

// Context Mocks
export const mockProfiles = [{ id: "p1", title: "Profile 1", userId: "u1", description: "", createdAt: 0, updatedAt: 0 }];
export const mockCategories = [
  { id: "c1", name: "Cat 1", isActive: true, slug: "cat1", order: 1, subcategories: [{ id: "s1", name: "Sub 1", isActive: true, slug: "sub1", order: 1 }] },
];
export const mockActions = {
  createAd: vi.fn(),
  updateAd: vi.fn(),
  uploadAdImage: vi.fn(),
};

export const mockOpenLoginModal = vi.fn();

export const wrapper = ({ children }: { children: React.ReactNode }) => (
  // @ts-expect-error - mock
  <AuthContext.Provider value={{ user: { uid: "u1" }, isAdmin: false, loading: false }}>
    { /* @ts-expect-error - mock */ }
    <LoginModalContext.Provider value={{ openLoginModal: mockOpenLoginModal }}>
      <AdFormProvider profiles={mockProfiles} categories={mockCategories} actions={mockActions}>
        {children}
      </AdFormProvider>
    </LoginModalContext.Provider>
  </AuthContext.Provider>
);

export const unauthWrapper = ({ children }: { children: React.ReactNode }) => (
  // @ts-expect-error - mock
  <AuthContext.Provider value={{ user: null, isAdmin: false, loading: false }}>
    { /* @ts-expect-error - mock */ }
    <LoginModalContext.Provider value={{ openLoginModal: mockOpenLoginModal }}>
      <AdFormProvider profiles={[]} categories={mockCategories} actions={mockActions}>
        {children}
      </AdFormProvider>
    </LoginModalContext.Provider>
  </AuthContext.Provider>
);

export const validValues = {
  title: "Test Ad",
  categoryId: "c1",
  subcategoryId: "s1",
  text: "Long enough description",
  advertiserProfileId: "p1",
  images: [],
} as const;

export function rootErrorMessage(
  form: ReturnType<typeof useAdFormLogic>["form"],
) {
  // React Hook Form accepts `root` in setError, but excludes that special key
  // from getFieldState's field-path type even though the public API reads it.
  const state = form.getFieldState("root" as never) as {
    error?: { message?: string };
  };
  return state.error?.message;
}
