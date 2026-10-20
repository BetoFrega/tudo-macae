// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAdFormLogic } from "./useAdFormLogic";
import {
  mockActions,
  mockOpenLoginModal,
  mockRouterPush,
  unauthWrapper,
  validValues,
  wrapper,
} from "./useAdFormLogic.fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

describe("useAdFormLogic login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call openLoginModal when user is not authenticated", async () => {
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper: unauthWrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, advertiserProfileId: undefined, images: [] });
    });

    expect(mockOpenLoginModal).toHaveBeenCalledTimes(1);
    expect(mockActions.createAd).not.toHaveBeenCalled();
  });

  it("should not call openLoginModal when user is authenticated", async () => {
    mockActions.createAd.mockResolvedValue({ success: true, adId: "ad1", slug: "slug1" });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, images: [] });
    });

    expect(mockOpenLoginModal).not.toHaveBeenCalled();
    expect(mockActions.createAd).toHaveBeenCalledTimes(1);
  });

  it("should pass onSuccess callback that executes the pending submit", async () => {
    mockActions.createAd.mockResolvedValue({ success: true, adId: "ad-x", slug: "slug-x" });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper: unauthWrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, advertiserProfileId: undefined, images: [] });
    });

    expect(mockOpenLoginModal).toHaveBeenCalledTimes(1);
    const [onSuccess] = mockOpenLoginModal.mock.calls[0] as [() => void, () => void];

    // Simulate successful login: fire the onSuccess callback
    await act(async () => {
      await onSuccess();
    });

    expect(mockActions.createAd).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/anuncio/ad-x/slug-x");
  });

  it("should set loginRequired via onDismiss callback when modal is closed without authenticating", async () => {
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper: unauthWrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, advertiserProfileId: undefined, images: [] });
    });

    expect(result.current.loginRequired).toBe(false);

    const [, onDismiss] = mockOpenLoginModal.mock.calls[0] as [() => void, () => void];

    act(() => {
      onDismiss();
    });

    await waitFor(() => {
      expect(result.current.loginRequired).toBe(true);
    });
  });

  it("should reset loginRequired to false on the next submit attempt", async () => {
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper: unauthWrapper });

    // First submit → dismiss → loginRequired becomes true
    await act(async () => {
      await result.current.onSubmit({ ...validValues, advertiserProfileId: undefined, images: [] });
    });
    const [, onDismiss] = mockOpenLoginModal.mock.calls[0] as [() => void, () => void];
    act(() => {
      onDismiss();
    });
    await waitFor(() => expect(result.current.loginRequired).toBe(true));

    // Second submit → loginRequired cleared immediately before modal opens
    await act(async () => {
      await result.current.onSubmit({ ...validValues, advertiserProfileId: undefined, images: [] });
    });

    expect(result.current.loginRequired).toBe(false);
  });
});
