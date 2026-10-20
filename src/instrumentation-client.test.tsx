// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { init } = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("posthog-js", () => ({ default: { init } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "project-token");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://t.tudomacae.com.br");
  window.history.replaceState(null, "", "/");
});

afterEach(() => vi.unstubAllEnvs());

test("sends data through the proxy while keeping PostHog links on its dashboard", async () => {
  await import("../instrumentation-client");

  expect(init).toHaveBeenCalledWith("project-token", expect.objectContaining({
    api_host: "https://t.tudomacae.com.br",
    ui_host: "https://eu.posthog.com",
  }));
});

test("removes raw business searches from automatic URL properties", async () => {
  await import("../instrumentation-client");
  const config = init.mock.calls[0]?.[1];
  const beforeSend = config?.before_send;
  expect(typeof beforeSend).toBe("function");

  expect(beforeSend?.({
    event: "business_search_submitted",
    properties: {
      $current_url: "https://www.tudomacae.com.br/negocios?nome=Caf%C3%A9&origem=home",
      $referrer: "https://www.tudomacae.com.br/negocios?nome=Oficina",
      $session_entry_url: "https://www.tudomacae.com.br/negocios?nome=Caf%C3%A9",
      source_surface: "home",
    },
    $set_once: {
      $initial_current_url: "https://www.tudomacae.com.br/negocios?nome=Caf%C3%A9",
      $initial_referrer: "https://www.tudomacae.com.br/negocios?nome=Cl%C3%ADnica",
      $session_entry_referrer: "https://www.tudomacae.com.br/negocios?nome=Oficina",
    },
  })).toEqual(expect.objectContaining({
    properties: expect.objectContaining({
      $current_url: "https://www.tudomacae.com.br/negocios?origem=home",
      $referrer: "https://www.tudomacae.com.br/negocios",
      $session_entry_url: "https://www.tudomacae.com.br/negocios",
      source_surface: "home",
    }),
    $set_once: expect.objectContaining({
      $initial_current_url: "https://www.tudomacae.com.br/negocios",
      $initial_referrer: "https://www.tudomacae.com.br/negocios",
      $session_entry_referrer: "https://www.tudomacae.com.br/negocios",
    }),
  }));
});

test("removes site searches from automatic URL properties", async () => {
  await import("../instrumentation-client");
  const beforeSend = init.mock.calls[0]?.[1]?.before_send;

  expect(beforeSend?.({
    event: "$pageview",
    properties: {
      $current_url: "https://www.tudomacae.com.br/busca?q=padaria%20da%20Ana",
      $referrer: "https://www.tudomacae.com.br/busca?q=oficina&q=segunda",
      $session_entry_url: "https://www.tudomacae.com.br/noticias?q=mantida",
    },
    $set: { $current_url: "https://www.tudomacae.com.br/busca/?q=padaria" },
  })).toEqual(expect.objectContaining({
    properties: expect.objectContaining({
      $current_url: "https://www.tudomacae.com.br/busca",
      $referrer: "https://www.tudomacae.com.br/busca",
      $session_entry_url: "https://www.tudomacae.com.br/noticias?q=mantida",
    }),
    $set: expect.objectContaining({ $current_url: "https://www.tudomacae.com.br/busca/" }),
  }));
});

test("never records sessions", async () => {
  await import("../instrumentation-client");
  expect(init.mock.calls[0]?.[1]).toMatchObject({ disable_session_recording: true });
});

test("removes typed searches from session replay and network URLs", async () => {
  await import("../instrumentation-client");
  const mask = init.mock.calls[0]?.[1]?.session_recording?.maskCapturedNetworkRequestFn;

  expect(mask?.({ name: "https://www.tudomacae.com.br/busca?q=padaria&_rsc=1", method: "GET" }))
    .toEqual({ name: "https://www.tudomacae.com.br/busca?_rsc=1", method: "GET" });
  expect(mask?.({ name: "https://www.tudomacae.com.br/negocios?nome=Caf%C3%A9" }))
    .toEqual({ name: "https://www.tudomacae.com.br/negocios" });
});

test("catalog events discard content, URLs and traits while replay excludes the private catalog", async () => {
  await import("../instrumentation-client");
  const config = init.mock.calls[0]?.[1];
  expect(config.session_recording).toMatchObject({ maskAllInputs: true, blockSelector: "[data-private-offering-catalog], [data-private-business-completion]" });
  const event = config.before_send({ event: "business_offering_first_item_saved", properties: { token: "project-token", source: "account", distinct_id: "actor", name: "Private item", payload: { description: "Private" }, $current_url: "https://example.com/private" }, $set: { name: "Private" } });
  expect(event.properties).toEqual({ token: "project-token", source: "account", distinct_id: "actor" });
  expect(event.$set).toBeUndefined();
});

test("redacts the private business completion URL from analytics and replay", async () => {
  await import("../instrumentation-client");
  const config = init.mock.calls[0]?.[1];
  const rawUrl = "https://www.tudomacae.com.br/minha-conta/perfis/private-id/concluido?origem=privada";
  const safeUrl = "https://www.tudomacae.com.br/minha-conta/perfis/[profileId]/concluido";

  expect(config.before_send({ event: "$pageview", properties: { $current_url: rawUrl } }))
    .toMatchObject({ properties: { $current_url: safeUrl } });
  expect(config.before_send({ event: "$pageview", properties: { $pathname: "/minha-conta/perfis/private-id/concluido" } }))
    .toMatchObject({ properties: { $pathname: "/minha-conta/perfis/[profileId]/concluido" } });
  expect(config.before_send({ event: "$pageview", properties: {
    $session_entry_pathname: "/minha-conta/perfis/private-id/concluido",
    $prev_pageview_pathname: "/minha-conta/perfis/private-id/concluido",
  } })).toMatchObject({ properties: {
    $session_entry_pathname: "/minha-conta/perfis/[profileId]/concluido",
    $prev_pageview_pathname: "/minha-conta/perfis/[profileId]/concluido",
  } });
  expect(config.session_recording.maskCapturedNetworkRequestFn({
    name: rawUrl,
    responseBody: "Private business and profile ID",
    requestBody: "Private input",
    responseHeaders: new Headers({ "x-private": "profile-id" }),
  })).toBeNull();
});

test("qualification exports only bounded authentication failures without automatic capture or profiles", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "qualification");
  await import("../instrumentation-client");
  const config = init.mock.calls[0]![1];
  expect(config).toMatchObject({ autocapture: false, capture_pageview: false, capture_pageleave: false, capture_exceptions: false, disable_session_recording: true, person_profiles: "never" });
  for (const event of ["$pageview", "$pageleave", "$snapshot", "$exception", "$identify", "user_authenticated", "arbitrary", "constructor", "toString", "__proto__"]) {
    expect(config.before_send({ event, properties: { operationId: "b7b16af1-5984-4a8e-b18c-337350c86e6b" } })).toBeNull();
  }
  for (const [event, route] of [["authentication_login_request_failed", "/api/autenticacao/entrar"], ["session_synchronization_failed", "/api/autenticacao/sessao"]]) {
    const result = config.before_send({ event, $unset: ["private"], $set: { email: "private@example.com" }, $set_once: { private: "private" }, properties: {
      token: "project-token", distinct_id: "visitor-id", operationId: "b7b16af1-5984-4a8e-b18c-337350c86e6b", release: "a".repeat(40), failureCategory: "http_status", httpStatus: 502, trigger: "background_refresh",
      environment: "production", route: "/private?token=private", email: "private@example.com", password: "private", $current_url: "https://example.com/?token=private", payload: "private",
    } });
    expect(result).toMatchObject({ event, properties: { environment: "qualification", $process_person_profile: false, route, operationId: "b7b16af1-5984-4a8e-b18c-337350c86e6b", release: "a".repeat(40), failureCategory: "http_status", httpStatus: 502, trigger: "background_refresh", token: "project-token", distinct_id: "visitor-id" } });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).not.toHaveProperty("$set");
    expect(result).not.toHaveProperty("$set_once");
    expect(result).not.toHaveProperty("$unset");
  }
  for (const [httpStatus, trigger] of [[99, "private"], [502.5, "constructor"], ["502", undefined]]) {
    const result = config.before_send({ event: "session_synchronization_failed", properties: { operationId: "b7b16af1-5984-4a8e-b18c-337350c86e6b", failureCategory: "private", httpStatus, trigger } });
    expect(result.properties).not.toHaveProperty("failureCategory");
    expect(result.properties).not.toHaveProperty("httpStatus");
    expect(result.properties).not.toHaveProperty("trigger");
  }
  expect(config.before_send({ event: "authentication_login_request_failed", properties: { operationId: "private" } })).toBeNull();
});

test("admin diagnostics discard SDK attribution and person enrichment before sending", async () => {
  const { sanitizeAnalyticsEvent } = await import("../instrumentation-client");
  const secret = "private-sentinel";
  const result = sanitizeAnalyticsEvent({
    event: "admin_render_failed", uuid: "diagnostic-id",
    $set: { email: secret }, $set_once: { email: secret }, $unset: [secret],
    properties: {
      component: "AdminError", route: "/admin", service: "browser", outcome: "error",
      environment: "production", release: "a".repeat(40), token: "project-token", distinct_id: "actor",
      $process_person_profile: true, $current_url: null, $pathname: null, $referrer: null,
      $initial_current_url: secret, $initial_referrer: secret, $session_entry_url: secret,
      $set_once: { email: secret }, $set: { email: secret }, message: secret,
    },
  });
  expect(result).toEqual({ event: "admin_render_failed", uuid: "diagnostic-id", properties: {
    component: "AdminError", route: "/admin", service: "browser", outcome: "error",
    environment: "production", release: "a".repeat(40), token: "project-token", distinct_id: "actor",
    $process_person_profile: false,
  } });
  expect(JSON.stringify(result)).not.toContain(secret);
});
