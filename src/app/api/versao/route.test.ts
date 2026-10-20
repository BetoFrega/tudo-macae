import { afterEach, expect, test, vi } from "vitest";
import { GET } from "./route";

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
afterEach(() => vi.unstubAllEnvs());

test("public version evidence identifies only the serving runtime and echoes a fresh challenge", async () => {
  vi.stubEnv("K_SERVICE", "macaetem-dev");
  vi.stubEnv("K_REVISION", "macaetem-dev-00001-abc");
  vi.stubEnv("PRIVATE_SECRET", "never-publish");
  const nonce = "a".repeat(32);
  const response = await GET(new Request(`https://www.tudomacae.com.br/api/versao?nonce=${nonce}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ service: "macaetem-dev", revision: "macaetem-dev-00001-abc", nonce });
});

test("public version evidence refuses malformed challenges and missing or inconsistent runtime identity", async () => {
  vi.stubEnv("K_SERVICE", "macaetem-dev");
  vi.stubEnv("K_REVISION", "macaetem-dev-00001-abc");
  for (const query of ["", "?nonce=short", `?nonce=${"a".repeat(32)}%0A`]) {
    const response = await GET(new Request(`https://www.tudomacae.com.br/api/versao${query}`));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
  }
  for (const revision of ["", "foreign-00001-abc", "macaetem-dev-invalid/private"]) {
    vi.stubEnv("K_REVISION", revision);
    const response = await GET(new Request(`https://www.tudomacae.com.br/api/versao?nonce=${"a".repeat(32)}`));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  }
});
