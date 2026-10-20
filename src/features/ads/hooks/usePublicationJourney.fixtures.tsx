import { vi } from "vitest";
import type { usePublicationJourney } from "./usePublicationJourney";

export const mocks = {
  authenticated: true,
  uid: "user",
  recover: vi.fn(),
  login: vi.fn(),
  profiles: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  upload: vi.fn(),
  sync: vi.fn(),
};

export const profile = { id: "profile", title: "Maria", contacts: [{ number: "22999999999", isWhatsapp: true }] };

export function fill(result: { current: ReturnType<typeof usePublicationJourney> }) {
  result.current.form.setValue("title", "Bicicleta");
  result.current.form.setValue("text", "Bicicleta em bom estado.");
  result.current.form.setValue("categoryId", "category");
  result.current.form.setValue("subcategoryId", "subcategory");
}

export function resetJourneyMocks() {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.uid = "user";
  window.history.replaceState(null, "", "/publicar");
  mocks.recover.mockResolvedValue(null);
  mocks.profiles.mockResolvedValue([profile]);
  mocks.save.mockResolvedValue({ success: true });
  mocks.sync.mockResolvedValue({ success: true, images: [] });
  mocks.publish.mockResolvedValue({ success: true, adId: "ad", slug: "bicicleta" });
}
