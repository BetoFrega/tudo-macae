import { revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { uploadAdImageUseCase } from "../../../integrations/ads/use-cases/uploadAdImageUseCase";
import { uploadAdImage } from "./uploadAdImage";
import sharp from "sharp";
import { PhotoError, PhotoUploadLimited } from "@tudomacae/classifieds-photos";

// These tests decode images with sharp, a native addon the Workers runtime
// (quality-flare's Tests check) cannot load.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../../integrations/ads/use-cases/uploadAdImageUseCase", () => ({
  uploadAdImageUseCase: vi.fn(),
}));

function signedIn() {
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "user-1",
    email: "pessoa@example.com",
    emailVerified: true,
    isAdmin: false,
    isEditor: false,
  });
}

let validImage: Uint8Array<ArrayBuffer>;

function imageFormData(file = new File([validImage], "anuncio.webp", {
  type: "image/webp",
})) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", "Frente da bicicleta");
  formData.append("description", "Vista frontal");
  return formData;
}

function listingTagCalls() {
  return vi.mocked(updateTag).mock.calls.map(([tag]) => tag)
    .filter(tag => tag.startsWith("ads-category-") || tag.startsWith("ads-subcategory-"));
}

describe.skipIf(inWorkers)("uploadAdImage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    signedIn();
    validImage = Uint8Array.from(await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).webp().toBuffer());
    vi.mocked(uploadAdImageUseCase).mockResolvedValue({
      image: {
        id: "image-1",
        path: "ad-images/ad-1/image-1.webp",
        title: "Frente da bicicleta",
        description: "Vista frontal",
        order: 0,
        url: "/api/anuncios/ad-1/fotos/image-1",
      },
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
    });
  });

  test("keeps the successful upload contract and cache invalidation", async () => {
    const result = await uploadAdImage("ad-1", imageFormData());

    expect(result).toEqual({ success: true });
    expect(uploadAdImageUseCase).toHaveBeenCalledWith({
      adId: "ad-1",
      userId: "user-1",
      file: expect.anything(),
      mimeType: "image/webp",
      title: "Frente da bicicleta",
      description: "Vista frontal",
      uploadId: expect.any(String),
    });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledWith("ad-ad-1");
    expect(listingTagCalls()).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test("preserves the quota wait as a recoverable upload result", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new PhotoUploadLimited("account_burst", 300_000);
    vi.mocked(uploadAdImageUseCase).mockRejectedValueOnce(error);
    expect(await uploadAdImage("ad-1", imageFormData())).toEqual({ success: false, reason: "rate_limit", error: error.message });
    expect(updateTag).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("sends retired Hosted uploads to reselecting the photo instead of retrying the same operation", async () => {
    const error = new PhotoError("retired", "Este envio atingiu três tentativas de processamento. Selecione a foto novamente para iniciar outro envio.");
    vi.mocked(uploadAdImageUseCase).mockRejectedValueOnce(error);
    expect(await uploadAdImage("ad-1", imageFormData())).toEqual({ success: false, reason: "invalid_photo", error: error.message });
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("marks Hosted validation failures as needing another photo", async () => {
    const error = new PhotoError("invalid", "A imagem processada excede o limite de 1MB.");
    vi.mocked(uploadAdImageUseCase).mockRejectedValueOnce(error);
    expect(await uploadAdImage("ad-1", imageFormData())).toEqual({ success: false, reason: "invalid_photo", error: error.message });
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("reports unexpected file-read failures with a safe support code", async () => {
    const file = new File([validImage], "photo.webp", { type: "image/webp" });
    const failure = new Error("private runtime and provider detail");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const uploadId = "840bed51-a092-43eb-a805-e681d30e2f1a";
    const form = imageFormData(file);
    form.append("uploadId", uploadId);
    expect(await uploadAdImage("ad-1", form)).toEqual({
      success: false, error: `Não foi possível enviar a imagem do anúncio. Código de suporte: ${uploadId}.`,
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "ads.image_upload.failed", outcome: "unexpected_failure", cause: "file_read", correlationId: uploadId,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
    expect(uploadAdImageUseCase).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("accepts an image at the 1MB boundary", async () => {
    const boundary = new File([validImage], "limite.webp", { type: "image/webp" });
    Object.defineProperty(boundary, "size", { value: 1024 * 1024 });

    await expect(uploadAdImage("ad-1", imageFormData(boundary))).resolves.toEqual({
      success: true,
    });
  });

  test("passes a validated retry ID to the upload use case", async () => {
    const formData = imageFormData();
    const uploadId = "840bed51-a092-43eb-a805-e681d30e2f1a";
    formData.append("uploadId", uploadId);
    await expect(uploadAdImage("ad-1", formData)).resolves.toEqual({ success: true });
    expect(uploadAdImageUseCase).toHaveBeenCalledWith(expect.objectContaining({ uploadId }));

    const invalid = imageFormData();
    invalid.append("uploadId", "../../other-ad");
    await expect(uploadAdImage("ad-1", invalid)).resolves.toEqual({
      success: false,
      error: "Identificador de envio inválido.",
    });
  });

  test("uses empty optional metadata when title and description are absent", async () => {
    const formData = new FormData();
    formData.append("file", new File([validImage], "anuncio.webp", {
      type: "image/webp",
    }));

    await uploadAdImage("ad-1", formData);

    expect(uploadAdImageUseCase).toHaveBeenCalledWith(expect.objectContaining({
      title: "",
      description: "",
    }));
  });

  test("returns intentional Portuguese validation messages", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    await expect(uploadAdImage("ad-1", imageFormData())).resolves.toEqual({
      success: false,
      error: "Entre na sua conta para enviar imagens ao anúncio.",
      reason: "authentication_required",
    });

    await expect(uploadAdImage("ad-1", new FormData())).resolves.toEqual({
      success: false,
      error: "Escolha uma imagem para enviar.",
    });

    const oversized = new File(["image"], "grande.webp", { type: "image/webp" });
    Object.defineProperty(oversized, "size", { value: 1024 * 1024 + 1 });
    await expect(uploadAdImage("ad-1", imageFormData(oversized))).resolves.toEqual({
      success: false,
      reason: "invalid_photo",
      error: "A imagem deve ter no máximo 1MB.",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("logs a sanitized upload failure correlated with the retry ID", async () => {
    const technicalError = new Error("bucket credential and provider detail");
    vi.mocked(uploadAdImageUseCase).mockRejectedValue(technicalError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const formData = imageFormData();
    const uploadId = "840bed51-a092-43eb-a805-e681d30e2f1a";
    formData.append("uploadId", uploadId);
    const result = await uploadAdImage("ad-1", formData);

    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0]))).toMatchObject({
      event: "ads.image_upload.failed", outcome: "unexpected_failure", cause: "upload", correlationId: uploadId,
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(technicalError.message);
    expect(result).toEqual({
      success: false,
      error: `Não foi possível enviar a imagem do anúncio. Código de suporte: ${uploadId}.`,
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("also converts an unexpected authentication failure into safe copy", async () => {
    const technicalError = new Error("session-cookie provider detail");
    vi.mocked(getCurrentUser).mockRejectedValue(technicalError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await uploadAdImage("ad-1", imageFormData());

    const event = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
    expect(event).toMatchObject({ event: "ads.image_upload.failed", outcome: "unexpected_failure", cause: "authentication" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(technicalError.message);
    expect(result).toEqual({ success: false, error: `Não foi possível enviar a imagem do anúncio. Código de suporte: ${event.correlationId}.` });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
