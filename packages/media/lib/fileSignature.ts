export type StaticMediaContentType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function staticMediaContentTypeFromSignature(bytes: Uint8Array): StaticMediaContentType | null {
  const signature = Buffer.from(bytes).subarray(0, 12);
  if (signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (/^GIF8[79]a/.test(signature.toString("ascii"))) return "image/gif";
  return signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
}
