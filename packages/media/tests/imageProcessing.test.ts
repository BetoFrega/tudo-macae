// @vitest-environment jsdom
// Exercises the browser image pipeline through canvas and FileReader.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processImage, validateImageFile } from "@tudomacae/media/imageProcessing";

describe("imageProcessing", () => {
  describe("validateImageFile", () => {
    it("should validate correct file type and size", () => {
      const file = new File([""], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: 1024 * 1024 }); // 1MB

      const result = validateImageFile(file);
      expect(result.isValid).toBe(true);
    });

    it("should reject invalid file type", () => {
      const file = new File([""], "test.txt", { type: "text/plain" });
      const result = validateImageFile(file);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Tipo de arquivo inválido");
    });

    it("should reject file too large for input (>20MB)", () => {
      const file = new File([""], "large.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: 21 * 1024 * 1024 });

      const result = validateImageFile(file);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Arquivo muito grande");
    });
  });

  describe("processImage", () => {
    // Mocks
    let originalImage: typeof Image;
    let originalFileReader: typeof FileReader;
    let originalCreateElement: typeof document.createElement;

    beforeEach(() => {
      vi.useFakeTimers(); // For the setTimeout loop

      // Mock FileReader
      originalFileReader = global.FileReader;
      class MockFileReader {
        onload: unknown = null;
        onerror: unknown = null;
        readAsDataURL() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const self = this;
          setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((self as any).onload) (self as any).onload({ target: { result: "data:image/jpeg;base64,mock" } });
          }, 0);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.FileReader = MockFileReader as any;

      // Mock Image
      originalImage = global.Image;
      class MockImage {
        onload: unknown = null;
        onerror: unknown = null;
        width = 1000;
        height = 1000;
        _src = "";
        set src(val: string) {
          this._src = val;
          setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((this as any).onload) (this as any).onload();
          }, 0);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.Image = MockImage as any;

      // Mock Canvas
      originalCreateElement = document.createElement;
      document.createElement = vi.fn((tagName) => {
        if (tagName === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({ drawImage: vi.fn(), fillRect: vi.fn() }),
            toBlob: vi.fn((callback, type) => {
              // Default: valid small blob
              const blob = new Blob(["mock"], { type: type || "image/webp" });
              callback(blob);
            }),
            toDataURL: vi.fn((type) => {
              if (type === "image/webp") return "data:image/webp;base64,mock";
              return "data:image/png;base64,mock";
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        return originalCreateElement.call(document, tagName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
    });

    afterEach(() => {
      global.FileReader = originalFileReader;
      global.Image = originalImage;
      document.createElement = originalCreateElement;
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("should resize large images", async () => {
      // Setup large image mock

      global.Image = class extends global.Image {
        constructor() {
          super();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this as any).width = 3000;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this as any).height = 2000;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const file = new File([""], "test.jpg", { type: "image/jpeg" });

      const promise = processImage(file);
      await vi.runAllTimersAsync();
      await promise;
    });

    it("should successfully compress an image", async () => {
      const file = new File([""], "test.jpg", { type: "image/jpeg" });
      const promise = processImage(file);

      await vi.runAllTimersAsync();
      const processed = await promise;

      expect(processed).toBeInstanceOf(File);
      expect(processed.type).toBe("image/webp");
      expect(processed.name).toBe("test.webp");
    });

    it("exports JPEG after filling the canvas white", async () => {
      const promise = processImage(new File([""], "photo.png", { type: "image/png" }), undefined, "image/jpeg");
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.type).toBe("image/jpeg");
      expect(result.name).toBe("photo.jpg");
      const canvas = vi.mocked(document.createElement).mock.results[0]!.value as HTMLCanvasElement;
      const context = canvas.getContext("2d")!;
      expect(context.fillStyle).toBe("#ffffff");
      expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1000, 1000);
      expect(vi.mocked(context.fillRect).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(context.drawImage).mock.invocationCallOrder[0]!);
    });

    it("keeps publication photos below the action request budget", async () => {
      const sizes = [980 * 1024, 900 * 1024];
      const toBlob = vi.fn((callback: (blob: Blob) => void) => {
        const blob = new Blob(["photo"], { type: "image/webp" });
        Object.defineProperty(blob, "size", { value: sizes.shift() ?? 900 * 1024 });
        callback(blob);
      });
      document.createElement = vi.fn((tagName) => {
        if (tagName === "canvas") return {
          width: 100, height: 100,
          getContext: vi.fn(() => ({ drawImage: vi.fn() })),
          toBlob,
          toDataURL: vi.fn(() => "data:image/webp;base64,mock"),
        } as unknown as HTMLCanvasElement;
        return originalCreateElement.call(document, tagName);
      });
      const promise = processImage(new File(["photo"], "photo.png", { type: "image/png" }), 950 * 1024);
      await vi.runAllTimersAsync();
      expect(await promise).toBeInstanceOf(File);
      expect(toBlob).toHaveBeenCalledTimes(2);
    });

    it("should fallback to jpeg if webp is not supported", async () => {
      // Mock fallback
      document.createElement = vi.fn((tagName) => {
        if (tagName === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({ drawImage: vi.fn() })),

            toBlob: vi.fn((cb, type) => cb(new Blob([""], { type: type || "image/jpeg" }))),
            toDataURL: vi.fn((type) => {
              // Helper check returns data:image/png if webp not supported roughly
              if (type === "image/webp") return "data:image/png;base64,...";
              return "data:image/png...";
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        return originalCreateElement.call(document, tagName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      const file = new File([""], "test.jpg", { type: "image/jpeg" });
      const promise = processImage(file);

      await vi.runAllTimersAsync();
      const processed = await promise;

      expect(processed.type).toBe("image/jpeg");
      expect(processed.name).toBe("test.jpg");
    });

    it("should fail if canvas context is missing", async () => {
      document.createElement = vi.fn((tagName) => {
        if (tagName === "canvas") {
          return {
            getContext: () => null, // Fail context
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        return originalCreateElement.call(document, tagName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      const file = new File([""], "test.jpg", { type: "image/jpeg" });
      const promise = processImage(file);

      const assertionChain = expect(promise).rejects.toThrow("Failed to get canvas context");
      await vi.runAllTimersAsync();

      await assertionChain;
    });

    it("should fail if output size is still too large", async () => {
      // Mock always large blob
      document.createElement = vi.fn((tagName) => {
        if (tagName === "canvas") {
          return {
            width: 100,
            height: 100,
            getContext: vi.fn(() => ({ drawImage: vi.fn() })),
            toBlob: vi.fn((cb) => {
              const largeBlob = new Blob([""], { type: "image/webp" });
              Object.defineProperty(largeBlob, "size", { value: 2 * 1024 * 1024 }); // 2MB
              cb(largeBlob);
            }),
            toDataURL: vi.fn(() => "data:image/webp;base64,mock"),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        return originalCreateElement.call(document, tagName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      const file = new File([""], "test.jpg", { type: "image/jpeg" });
      const promise = processImage(file);

      // Attach handler before running timers to catch rejection
      const assertionChain = expect(promise).rejects.toThrow("Não foi possível comprimir a imagem");

      await vi.runAllTimersAsync();

      await assertionChain;
    });
  });
});
