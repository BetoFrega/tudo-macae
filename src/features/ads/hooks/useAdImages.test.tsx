// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import { useAdImages } from "./useAdImages";
import React, { ReactNode } from "react";

// Mocks
const mockValidateImageFile = vi.fn();
const mockProcessImage = vi.fn();

vi.mock("@tudomacae/media/imageProcessing", () => ({
  validateImageFile: (...args: unknown[]) => mockValidateImageFile(...args),
  processImage: (...args: unknown[]) => mockProcessImage(...args),
}));

import { AdFormSchema } from "../schemas/adFormSchema";

// Wrapper component factory
const createWrapper = (initialImages: AdFormSchema["images"] = []) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    const methods = useForm<AdFormSchema>({
      defaultValues: {
        images: initialImages,
      },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
  };
};

describe("useAdImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:test");
    global.URL.revokeObjectURL = vi.fn();
  });

  const createMockFile = (name = "test.jpg", type = "image/jpeg") => {
    return new File(["test"], name, { type });
  };

  it("should initialize with empty images array", () => {
    const { result } = renderHook(() => useAdImages(), {
      wrapper: createWrapper([]),
    });
    expect(result.current.images).toEqual([]);
    expect(result.current.uploadError).toBeNull();
  });

  it("should initialize with provided images via form defaultValues", () => {
    const initialImages = [
      { id: "1", url: "url1", order: 0, title: "T1", description: "D1", path: "p1" },
    ];
    const { result } = renderHook(() => useAdImages(), {
      wrapper: createWrapper(initialImages),
    });
    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].id).toBe("1");
  });

  it("should handle valid image selection", async () => {
    const { result } = renderHook(() => useAdImages(), {
      wrapper: createWrapper([]),
    });
    const file = createMockFile();

    mockValidateImageFile.mockReturnValue({ isValid: true });
    mockProcessImage.mockResolvedValue(file);

    const event = {
      target: {
        files: [file],
        value: "path/to/file",
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleImageSelect(event);
    });

    expect(mockValidateImageFile).toHaveBeenCalledWith(file);
    expect(mockProcessImage).toHaveBeenCalledWith(file, undefined, "image/jpeg");
    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].file).toBe(file);
    expect(result.current.uploadError).toBeNull();
  });

  it("reports photo preprocessing before the file appears in the form", async () => {
    const onProcessingChange = vi.fn();
    const file = createMockFile();
    let finishProcessing!: (file: File) => void;
    mockValidateImageFile.mockReturnValue({ isValid: true });
    mockProcessImage.mockReturnValue(new Promise<File>((resolve) => {
      finishProcessing = resolve;
    }));
    const { result } = renderHook(() => useAdImages(undefined, onProcessingChange), {
      wrapper: createWrapper([]),
    });
    const event = { target: { files: [file], value: "photo.jpg" } } as unknown as React.ChangeEvent<HTMLInputElement>;

    let selection!: Promise<void>;
    await act(async () => {
      selection = result.current.handleImageSelect(event);
    });
    expect(onProcessingChange).toHaveBeenCalledWith(true);
    expect(result.current.images).toHaveLength(0);

    await act(async () => {
      finishProcessing(file);
      await selection;
    });
    expect(onProcessingChange).toHaveBeenLastCalledWith(false);
    expect(result.current.images).toHaveLength(1);
  });

  it("should handle invalid image selection", async () => {
    const { result } = renderHook(() => useAdImages(), {
      wrapper: createWrapper([]),
    });
    const file = createMockFile();

    mockValidateImageFile.mockReturnValue({ isValid: false, error: "Invalid file" });

    const event = {
      target: {
        files: [file],
        value: "path/to/file",
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleImageSelect(event);
    });

    expect(result.current.images).toHaveLength(0);
    expect(result.current.uploadError).toBe("Invalid file");
  });

  it.each(["success", "failure"])("discards a stale photo processing %s without mutating the next publication", async (outcome) => {
    const file = createMockFile();
    let current = true;
    let finish!: (file: File) => void;
    let fail!: (error: Error) => void;
    mockValidateImageFile.mockReturnValue({ isValid: true });
    mockProcessImage.mockReturnValue(new Promise<File>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    }));
    const processing = vi.fn();
    const { result } = renderHook(() => useAdImages(undefined, processing, () => () => current), {
      wrapper: createWrapper([]),
    });
    const event = { target: { files: [file], value: "photo.jpg" } } as unknown as React.ChangeEvent<HTMLInputElement>;
    let selection!: Promise<void>;
    await act(async () => {
      selection = result.current.handleImageSelect(event);
    });
    current = false;
    await act(async () => {
      if (outcome === "success") finish(file);
      else fail(new Error("Old photo failure"));
      await selection;
    });
    expect(result.current.images).toHaveLength(0);
    expect(result.current.uploadError).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(processing).toHaveBeenLastCalledWith(false);
  });

  it("should remove image", async () => {
    const initialImages = [
      { id: "1", url: "url1", order: 0, title: "T1", description: "D1", path: "p1" },
    ];
    const { result } = renderHook(() => useAdImages(), {
      wrapper: createWrapper(initialImages),
    });

    await act(async () => {
      result.current.handleRemoveImage(0);
    });

    expect(result.current.images).toHaveLength(0);
  });

  it("should update image metadata", async () => {
    const initialImages = [
      { id: "1", url: "url1", order: 0, title: "", description: "", path: "p1" },
    ];
    const { result } = renderHook(() => useAdImages(), {
      wrapper: createWrapper(initialImages),
    });

    await act(async () => {
      result.current.handleImageMetadataChange(0, "title", "New Title");
    });

    expect(result.current.images[0].title).toBe("New Title");
  });
});
