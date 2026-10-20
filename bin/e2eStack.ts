import { repositoryRoot } from "./appPorts.ts";

/**
 * What the e2e stack shares with its callers. `tests/e2e/bin/e2e-stack.mjs` is
 * the process Playwright's `webServer` starts: the API Worker fixture, then the
 * production build, then the server.
 */

/** The value of `NEXT_PUBLIC_APP_ENV` in the e2e build. */
export const TEST_APP_ENV = "test";

/** Output from the app server child, captured for browser-level assertions. */
export const E2E_SERVER_LOG_PATH = `${repositoryRoot}/.next/e2e-server.log`;

/** Sanitized detailed logs kept outside the agent's default console context. */
export const E2E_BUILD_LOG_PATH = `${repositoryRoot}/tests/e2e/test-results/e2e-logs/build.log`;

/**
 * Which renderer builds and serves the app. `vinext` is the phase 3 trial:
 * `vite build` plus `vite preview` in workerd. A reused server must have been
 * started with the same `E2E_RENDERER`, or renderer-specific assertions read
 * the wrong build.
 */
export type E2eRenderer = "next" | "vinext";

export function e2eRenderer(env: NodeJS.ProcessEnv = process.env): E2eRenderer {
  const renderer = env.E2E_RENDERER ?? "next";
  if (renderer !== "next" && renderer !== "vinext") {
    throw new Error(`E2E_RENDERER inválido: ${renderer}`);
  }
  return renderer;
}

/**
 * Records the renderer of the running server. Playwright reuses a server already on
 * the port without starting the stack, so global setup compares this with `E2E_RENDERER`.
 */
export const E2E_RENDERER_PATH = `${repositoryRoot}/.next/e2e-renderer`;

/** Why a reused server cannot serve this run, or `undefined` when it can. */
export function reusedRendererMismatch(expected: E2eRenderer, recorded: string | undefined): string | undefined {
  const served = recorded?.trim();
  if (served === expected) return undefined;
  return `The running e2e server was started with E2E_RENDERER=${served || "unknown"}, but this run asks for ${expected}.\n\n`
    + "Stop that server and run the suite again.";
}

/** The line each renderer's server prints once it listens, after ANSI codes are removed. */
export const E2E_SERVER_READY: Record<E2eRenderer, RegExp> = {
  next: /Ready in/u,
  vinext: /Local:\s+http:\/\/localhost:\d+/u,
};
