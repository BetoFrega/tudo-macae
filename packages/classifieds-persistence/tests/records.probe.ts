import type * as entry from "../records";
export async function run(module: typeof entry) {
  const codec = module.createClassifiedsRecordCodec();
  codec.key("profile", "profile");
  const record = codec.parse({ kind: "profile", id: "profile", body: { title: "Nome", createdAt: 0 } });
  codec.indexes(record);
  const artifactIndex = module.createClassifiedsArtifactIndex({ ownsImagePath: () => false, cleanupJobId: path => path });
  const ad = { kind: "ad", id: "ad", body: { userId: "owner", status: "active", createdAt: 0 } } as const;
  artifactIndex.artifacts(ad);
  artifactIndex.encode(ad);
}
