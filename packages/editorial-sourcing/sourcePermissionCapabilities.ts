export const sourcePermissionCapabilities = [
  "factualResearch",
  "monitoring",
  "reproduction",
  "mediaUse",
] as const;

export type SourcePermissionCapability
  = typeof sourcePermissionCapabilities[number];
