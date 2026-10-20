export const LOCAL_METADATA_SERVER_DETECTION = "none";

export function disableMetadataServerDetection(env: NodeJS.ProcessEnv) {
  env.METADATA_SERVER_DETECTION = LOCAL_METADATA_SERVER_DETECTION;
}
