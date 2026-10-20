const DEPLOYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

type RuntimeEnvironment = Record<string, string | undefined>;

/** Keeps the runtime on the identity already embedded in the built HTML. */
export function runtimeDeploymentId(
  environment: RuntimeEnvironment,
  builtDeploymentId: string,
) {
  const candidate = builtDeploymentId.trim();

  if (!DEPLOYMENT_ID.test(candidate)) {
    throw new Error("Missing or invalid deployment identity.");
  }
  if (environment.NEXT_DEPLOYMENT_ID !== undefined
    && environment.NEXT_DEPLOYMENT_ID !== candidate) {
    throw new Error("Runtime deployment identity does not match the built application.");
  }

  return candidate;
}
