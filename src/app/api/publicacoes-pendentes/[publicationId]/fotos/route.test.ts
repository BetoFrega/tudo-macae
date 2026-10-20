// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { PendingPhotoConflict } from "@tudomacae/ads/syncPendingPublicationImages";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";

const mocks = vi.hoisted(() => ({ user: vi.fn(), sync: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/integrations/ads/publicationPhotos", () => ({ syncPendingPublicationImages: mocks.sync }));
import { POST } from "./route";

beforeEach(() => {
  mocks.user.mockReset();
  mocks.sync.mockReset();
});

test.each([false, true])("qualified upload outages keep one reporting owner (%s)", async (reported) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockResolvedValue({ uid: "owner" });
    mocks.sync.mockRejectedValue(new ClassifiedsRequestError("unavailable", crypto.randomUUID(), reported));
    const form = new FormData();
    form.set("images", "[]");
    const response = await POST(new Request("https://example.test/api/publicacoes-pendentes/pending-ad/fotos", {
      method: "POST", headers: { origin: "https://example.test", host: "example.test" }, body: form,
    }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Operation-Id")).toBeTruthy();
    expect(log).toHaveBeenCalledTimes(reported ? 0 : 1);
  }
  finally { log.mockRestore(); }
});

test("same-origin photo upload behind the production gateway succeeds", async () => {
  mocks.user.mockResolvedValue({ uid: "owner" });
  mocks.sync.mockResolvedValue([]);
  const form = new FormData();
  form.set("images", "[]");
  const response = await POST(new Request("http://127.0.0.1:8081/api/publicacoes-pendentes/pending-ad/fotos", {
    method: "POST",
    headers: {
      "origin": "https://www.tudomacae.com.br",
      "host": "www.tudomacae.com.br",
      "x-forwarded-host": "www.tudomacae.com.br",
      "x-forwarded-proto": "https",
    },
    body: form,
  }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
  expect({ status: response.status, body: await response.json() }).toEqual({ status: 200, body: { images: [] } });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.sync).toHaveBeenCalledWith("owner", "pending-ad", expect.any(FormData), expect.any(String));
});

test.each([
  ["missing Origin", "origin", undefined],
  ["opaque Origin", "origin", "null"],
  ["external Origin", "origin", "https://attacker.example"],
  ["Origin with a path", "origin", "https://www.tudomacae.com.br/"],
  ["internal Origin", "origin", "http://127.0.0.1:8081"],
  ["conflicting public hosts", "host", "attacker.example"],
  ["multiple forwarded hosts", "x-forwarded-host", "www.tudomacae.com.br,attacker.example"],
  ["multiple forwarded protocols", "x-forwarded-proto", "https,http"],
])("rejects %s before session or photo processing", async (_name, header, value) => {
  const headers = new Headers({
    "origin": "https://www.tudomacae.com.br",
    "host": "www.tudomacae.com.br",
    "x-forwarded-host": "www.tudomacae.com.br",
    "x-forwarded-proto": "https",
  });
  if (value === undefined) headers.delete(header!);
  else headers.set(header!, value);
  const response = await POST(new Request("http://127.0.0.1:8081/api/publicacoes-pendentes/pending-ad/fotos", {
    method: "POST", headers,
  }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Solicitação inválida." });
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

test("same-origin uploads still require an authenticated session", async () => {
  mocks.user.mockResolvedValue(null);
  const response = await POST(new Request("http://localhost:3000/api/publicacoes-pendentes/pending-ad/fotos", {
    method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000" },
  }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Entre na sua conta para continuar." });
  expect(mocks.sync).not.toHaveBeenCalled();
});

test("a stale photo snapshot returns reload guidance without reporting an operational failure", async () => {
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockResolvedValue({ uid: "owner" });
    mocks.sync.mockRejectedValue(new PendingPhotoConflict());
    const form = new FormData();
    form.set("images", "[]");
    const response = await POST(new Request("https://example.test/api/publicacoes-pendentes/pending-ad/fotos", {
      method: "POST", headers: { origin: "https://example.test", host: "example.test" }, body: form,
    }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "As fotos mudaram em outra sessão. Recarregue a página antes de salvar novamente." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Operation-Id")).toBeTruthy();
    expect(reported).not.toHaveBeenCalled();
  }
  finally {
    reported.mockRestore();
  }
});

test("an unexpected photo failure preserves operational telemetry and retry guidance", async () => {
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockResolvedValue({ uid: "owner" });
    mocks.sync.mockRejectedValue(new Error("Private photo read unavailable"));
    const form = new FormData();
    form.set("images", JSON.stringify([{ id: "photo", title: "", description: "", order: 0 }]));
    form.set("file-0", new File(["photo"], "front.png", { type: "image/png" }));
    const response = await POST(new Request("https://example.test/api/publicacoes-pendentes/pending-ad/fotos", {
      method: "POST", headers: { origin: "https://example.test", host: "example.test" }, body: form,
    }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
    expect(response.status).toBe(503);
    const operationId = response.headers.get("X-Operation-Id");
    expect(operationId).toBeTruthy();
    expect(await response.json()).toEqual({ error: "Não foi possível salvar as fotos. Tente novamente." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(reported).toHaveBeenCalledOnce();
    expect(JSON.parse(String(reported.mock.calls[0]![0]))).toMatchObject({
      event: "ads.pending_photo.sync_failed", operationId, cause: "Error",
    });
    expect(reported.mock.calls[0]![0]).not.toContain("Private photo read unavailable");
  }
  finally {
    reported.mockRestore();
  }
});

test("an expired upload returns reselect guidance without operational failure telemetry", async () => {
  const message = "O envio desta foto expirou. Selecione-a novamente e tente salvar.";
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.user.mockResolvedValue({ uid: "owner" });
    mocks.sync.mockRejectedValue(new Error(message));
    const form = new FormData();
    form.set("images", "[]");
    const response = await POST(new Request("https://example.test/api/publicacoes-pendentes/pending-ad/fotos", {
      method: "POST", headers: { origin: "https://example.test", host: "example.test" }, body: form,
    }), { params: Promise.resolve({ publicationId: "pending-ad" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Operation-Id")).toBeTruthy();
    expect(reported).not.toHaveBeenCalled();
  }
  finally { reported.mockRestore(); }
});
