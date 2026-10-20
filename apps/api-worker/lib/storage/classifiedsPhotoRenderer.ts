import type { ClassifiedsPhotoRenderer } from "../classifiedsPhotoHttp";

export function createClassifiedsPhotoRenderer(images: ImagesBinding): ClassifiedsPhotoRenderer {
  return async (bytes, width) => {
    const source = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes);
      controller.close();
    } });
    const output = await images.input(source).transform({ width, fit: "scale-down" }).output({ format: "image/webp", quality: 75 });
    return output.image();
  };
}
