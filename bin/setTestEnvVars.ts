import { disableMetadataServerDetection } from "./metadataServerDetection.ts";

export function setTestEnvVars() {
  disableMetadataServerDetection(process.env);

  // Exercise the local assisted workflow with deterministic allowances. The
  // contract suite verifies the separate readOnly incident mode.
  process.env.EDITORIAL_MCP_MODE = "enabled";
  process.env.EDITORIAL_MCP_READS_PER_MINUTE = "20";
  process.env.EDITORIAL_MCP_MUTATIONS_PER_MINUTE = "20";
}
