// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import posthog from "posthog-js";
import { PublicOfferingCatalog } from "./PublicOfferingCatalog";
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
test("revocation clears a mounted section within the polling interval without repeated pageview events", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => new Response("null", { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const initial = { items: [{ id: "a", name: "Consulta", description: "Descrição", price: { mode: "on_request" as const } }] };
  const { rerender } = render(<PublicOfferingCatalog businessId="business" initial={initial} />);
  expect(screen.getByRole("heading", { name: "Consulta" })).toBeVisible();
  rerender(<PublicOfferingCatalog businessId="business" initial={initial} />);
  expect(posthog.capture).toHaveBeenCalledTimes(1);
  screen.getByRole("link", { name: "Link direto para o catálogo" }).focus();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(14999);
  });
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetcher).toHaveBeenCalledWith("/api/negocios/business/catalogo", expect.objectContaining({ cache: "no-store" }));
  expect(screen.getByRole("status")).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Este catálogo não está disponível agora.");
  expect(screen.queryByRole("heading", { name: "Consulta" })).not.toBeInTheDocument();
});

test("hidden tabs stop polling and verify when visible again", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => new Response("null", { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  let hidden = false;
  const original = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  try {
    render(<PublicOfferingCatalog businessId="business" initial={{ items: [] }} />);
    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(fetcher).not.toHaveBeenCalled();
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
  finally {
    if (original) Object.defineProperty(document, "hidden", original);
    else Reflect.deleteProperty(document, "hidden");
  }
});

test.each(["success", "failure"])("a stale %s cannot overwrite a newer revocation after visibility changes", async (outcome) => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const older = new Promise<Response>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  const fetcher = vi.fn().mockReturnValueOnce(older).mockResolvedValueOnce(new Response("null", { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  let hidden = false;
  const original = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  const initial = { items: [{ id: "a", name: "Consulta", description: "", price: { mode: "on_request" as const } }] };
  try {
    render(<PublicOfferingCatalog businessId="business" initial={initial} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await act(async () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Este catálogo não está disponível agora.");
    await act(async () => {
      if (outcome === "success") resolve(new Response(JSON.stringify(initial)));
      else reject(new Error("Late network failure"));
    });
    expect(screen.queryByRole("heading", { name: "Consulta" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Este catálogo não está disponível agora.");
  }
  finally {
    if (original) Object.defineProperty(document, "hidden", original);
    else Reflect.deleteProperty(document, "hidden");
  }
});
