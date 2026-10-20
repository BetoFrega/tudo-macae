import type * as entry from "../records";
export async function run(module: typeof entry) {
  const codec = module.createEditorialRecordCodec();
  codec.key("mediaRevision", "1", "media");
  codec.parse({ kind: "article", id: "post", body: { status: "draft", createdAt: 0 } });
}
