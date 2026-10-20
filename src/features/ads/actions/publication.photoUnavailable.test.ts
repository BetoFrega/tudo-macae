import { beforeEach, expect, test, vi } from "vitest";
import { PhotoError } from "@tudomacae/classifieds-photos";
import type { PublicationReview } from "@tudomacae/ads/client";
import { pendingPublicationTransitions } from "../../../integrations/ads/pendingPublicationTransitions";
import { deletePendingPublication, publishPendingPublication } from "./publication";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn(async () => ({ uid: "owner", emailVerified: true })) }));
vi.mock("../../../integrations/ads/pendingPublicationTransitions", () => ({ pendingPublicationTransitions: { publish: vi.fn(), delete: vi.fn() } }));
vi.mock("@/integrations/ads/publication", () => ({ publicationReviewInput: { parse: (value: unknown) => value }, readPublication: vi.fn(async () => null) }));

const reviewed = {} as PublicationReview;
let events: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    events.push(JSON.parse(line).event);
  });
});

test("an unavailable photo at publication asks the advertiser to review the photo", async () => {
  vi.mocked(pendingPublicationTransitions.publish).mockRejectedValue(new PhotoError("unavailable", "Não foi possível confirmar as fotos. Releia a publicação antes de tentar novamente."));
  await expect(publishPendingPublication("pending", reviewed)).resolves.toMatchObject({ success: false, photoUnavailable: true, error: expect.stringContaining("Remova ou substitua a foto") });
  expect(events).toEqual(["ads.pending_publication.linked_photo_missing"]);
});

test("other photo refusals keep their message without the photo review", async () => {
  vi.mocked(pendingPublicationTransitions.publish).mockRejectedValue(new PhotoError("conflict", "As fotos mudaram. Releia antes de publicar."));
  await expect(publishPendingPublication("pending", reviewed)).resolves.toMatchObject({ success: false, photoUnavailable: false, error: "As fotos mudaram. Releia antes de publicar." });
  expect(events).toEqual([]);
});

test("an unavailable photo while deleting stays an unexpected failure", async () => {
  vi.mocked(pendingPublicationTransitions.delete).mockRejectedValue(new PhotoError("unavailable", "Falha"));
  await expect(deletePendingPublication("pending")).resolves.toMatchObject({ success: false, photoUnavailable: false, error: expect.stringContaining("Código:") });
  expect(events).toEqual(["ads.pending_publication.mutation_failed"]);
});
