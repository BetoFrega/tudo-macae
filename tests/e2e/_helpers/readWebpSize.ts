/**
 * Width and height of a WebP, read from the file's own header.
 *
 * A rendered `<img>` cannot answer this: `next/image` emits a `srcset` with
 * width descriptors, and the browser then reports `naturalWidth` corrected for
 * the density it picked — a number that says nothing about the stored file. So
 * a test that wants to know what actually reached the bucket parses the bytes.
 *
 * Covers the three WebP flavours: simple lossy (`VP8 `), lossless (`VP8L`) and
 * extended (`VP8X`).
 */
export function readWebpSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF"
    || bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new Error("Not a WebP file");
  }

  const format = bytes.subarray(12, 16).toString("ascii");

  if (format === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3FFF,
      height: bytes.readUInt16LE(28) & 0x3FFF,
    };
  }

  if (format === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3FFF) + 1,
      height: ((bits >> 14) & 0x3FFF) + 1,
    };
  }

  if (format === "VP8X") {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }

  throw new Error(`Unknown WebP format chunk: ${format}`);
}
