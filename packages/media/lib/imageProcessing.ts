"use client";
/*
 * The browser-side half of the media library: it validates what a person
 * picked and processes it into what the bucket accepts. It lives here, with
 * the acervo, and every uploader in the product consumes it from here —
 * media, ads and advertiser profiles — so the rules and the refusal messages
 * have exactly one copy.
 */

export const MAX_INPUT_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB limit for input
export const MAX_OUTPUT_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB limit for output
export const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;
export const VALID_IMAGE_TYPES_ACCEPT = VALID_IMAGE_TYPES.join(",");

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates an image file for type and size constraints.
 * @param file - The file to validate
 * @returns Validation result with error message if invalid
 */
export function validateImageFile(file: File): ImageValidationResult {
  if (!VALID_IMAGE_TYPES.includes(file.type as typeof VALID_IMAGE_TYPES[number])) {
    return {
      isValid: false,
      error: "Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF.",
    };
  }

  if (file.size > MAX_INPUT_IMAGE_SIZE) {
    return {
      isValid: false,
      error: "Arquivo muito grande. O tamanho máximo é 20MB.",
    };
  }

  return { isValid: true };
}

const MAX_DIMENSION = 1920;
/**
 * Calculates new dimensions for an image while maintaining aspect ratio.
 * Ensures dimensions do not exceed MAX_DIMENSION (1920px).
 * @param width - Current image width
 * @param height - Current image height
 * @returns Object containing the new width and height
 */
function calculateDimensions(width: number, height: number): { width: number; height: number } {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      return {
        width: MAX_DIMENSION,
        height: Math.round((height * MAX_DIMENSION) / width),
      };
    }
    else {
      return {
        width: Math.round((width * MAX_DIMENSION) / height),
        height: MAX_DIMENSION,
      };
    }
  }
  return { width, height };
}

/**
 * Creates a canvas element with the specified dimensions and returns its context.
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Object with canvas element and its 2D context (if available)
 */
function getCanvasContext(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

/**
 * Processes an image file:
 * 1. Resizes if too large (dimensions)
 * 2. Exports the requested format (JPEG fills transparency with white)
 * 3. Compresses iteratively to ensure size < 1MB
 * @param file - The input file
 * @returns A promise that resolves to the processed File
 */
export async function processImage(file: File, maxOutputSize = MAX_OUTPUT_IMAGE_SIZE, format: "image/webp" | "image/jpeg" = "image/webp"): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const { width, height } = calculateDimensions(img.width, img.height);
        const { canvas, ctx } = getCanvasContext(width, height);

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        if (format === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);

        const isWebPSupported = format === "image/webp" && checkWebPSupport(canvas);
        const outputType = isWebPSupported ? "image/webp" : "image/jpeg";
        const fileExtension = isWebPSupported ? ".webp" : ".jpg";

        const compressWithQuality = (qualityStep: number) => {
          const quality = qualityStep / 10;
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Canvas to Blob failed"));
                return;
              }

              if (blob.size <= maxOutputSize || qualityStep <= 1) {
                if (blob.size > maxOutputSize) {
                  reject(
                    new Error(
                      "Não foi possível comprimir a imagem para o limite de envio. Tente uma imagem menor.",
                    ),
                  );
                  return;
                }

                const processedFile = new File(
                  [blob],
                  file.name.replace(/\.[^/.]+$/, "") + fileExtension,
                  { type: outputType },
                );
                resolve(processedFile);
              }
              else {
                // Yield to event loop to prevent UI freezing
                setTimeout(() => {
                  compressWithQuality(qualityStep - 1);
                }, 0);
              }
            },
            outputType,
            quality,
          );
        };

        compressWithQuality(9);
      };
      img.onerror = err => reject(err);
    };
    reader.onerror = err => reject(err);
  });
}

/**
 * Checks if the browser supports WebP export from canvas.
 * @param canvas - The canvas element to check against
 * @returns True if WebP export is supported, false otherwise
 */
function checkWebPSupport(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
}
