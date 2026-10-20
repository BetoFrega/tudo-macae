import { readFile } from "node:fs/promises";
import { repositoryRoot } from "../../../../bin/appPorts";
/** Captured at import so a test that stubs `fetch` still reaches the fixture and the API Worker. */
export const networkFetch = globalThis.fetch;
export async function workerFixture<T>(
  operation: string,
  input: unknown,
): Promise<T> {
  const configuration = JSON.parse(
    await readFile(
      process.env.AUTHENTICATION_FIXTURE_CONFIGURATION
      ?? `${repositoryRoot}/tests/e2e/test-results/authentication-runtime.json`,
      "utf8",
    ),
  );
  process.env.AUTHENTICATION_API_URL = configuration.AUTHENTICATION_API_URL;
  process.env.AUTHENTICATION_TEST_SERVICE_TOKEN
    = configuration.AUTHENTICATION_TEST_SERVICE_TOKEN;
  process.env.PUBLIC_APP_ORIGIN ??= "https://www.tudomacae.com.br";
  process.env.NEXT_PUBLIC_APP_ENV = "test";
  const target = new URL(operation, configuration.controllerOrigin);
  if (target.hostname !== "127.0.0.1")
    throw new Error("Fixture must use loopback");
  const response = await networkFetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Authentication fixture failed");
  return (await response.json()) as T;
}
