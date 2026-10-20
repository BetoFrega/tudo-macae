import type * as entry from "../fileInspection";

export async function run(module: typeof entry) {
  const inspection = module.createStaticMediaFileInspection({ decode: async () => ({ contentType: "image/png", width: 1, height: 1, pages: 1 }) });
  await inspection.inspect(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
}
