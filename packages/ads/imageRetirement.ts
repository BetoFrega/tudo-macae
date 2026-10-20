export const adImageRetirementCollection = "ad_image_retirements";

export function assertAdImagePathsReusable(paths: readonly string[], retiredPaths: readonly string[]) {
  const retired = new Set(retiredPaths);
  if (paths.some(path => retired.has(path))) {
    throw new Error("Esta foto foi removida. Selecione-a novamente.");
  }
}
