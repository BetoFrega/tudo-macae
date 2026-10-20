import posthog from "posthog-js";
import type { BeforeSendFn, CaptureResult, Properties } from "posthog-js";

const AUTOMATIC_URL_PROPERTIES = [
  "$current_url",
  "$initial_current_url",
  "$referrer",
  "$initial_referrer",
  "$session_entry_url",
  "$session_entry_referrer",
] as const;
const AUTOMATIC_PATHNAME_PROPERTIES = [
  "$pathname",
  "$session_entry_pathname",
  "$prev_pageview_pathname",
] as const;

/** Typed searches: the business catalog name filter and the site search query. */
function privateSearchParameters(url: URL) {
  return ["nome", ...(/^\/busca\/?$/u.test(url.pathname) ? ["q"] : [])];
}

function sanitizePrivateUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value, window.location.origin);
    if (/^\/minha-conta\/perfis\/[^/]+\/concluido\/?$/u.test(url.pathname)) {
      url.pathname = "/minha-conta/perfis/[profileId]/concluido";
      url.search = "";
      url.hash = "";
      return url.toString();
    }
    const privateParameters = privateSearchParameters(url).filter(name => url.searchParams.has(name));
    if (!privateParameters.length) return value;
    for (const name of privateParameters) url.searchParams.delete(name);
    return url.toString();
  }
  catch {
    return value;
  }
}

function isPrivateCompletionUrl(value: string): boolean {
  try {
    return /^\/minha-conta\/perfis\/[^/]+\/concluido\/?$/u.test(new URL(value, window.location.origin).pathname);
  }
  catch {
    return false;
  }
}

function sanitizeAutomaticUrlProperties(input: Properties): Properties {
  const properties: Properties = { ...input };
  for (const key of AUTOMATIC_URL_PROPERTIES) {
    properties[key] = sanitizePrivateUrl(properties[key]);
  }
  for (const key of AUTOMATIC_PATHNAME_PROPERTIES) {
    if (typeof properties[key] === "string"
      && /^\/minha-conta\/perfis\/[^/]+\/concluido\/?$/u.test(properties[key])) {
      properties[key] = "/minha-conta/perfis/[profileId]/concluido";
    }
  }
  return properties;
}

const qualification = process.env.NEXT_PUBLIC_APP_ENV === "qualification";
const qualificationFailures = {
  authentication_login_request_failed: { event: "authentication.login.request_failed", route: "/api/autenticacao/entrar" },
  session_synchronization_failed: { event: "authentication.session.refresh_failed", route: "/api/autenticacao/sessao" },
} as const;
const IDENTITY_PROPERTY_KEYS = ["token", "distinct_id", "$session_id", "$device_id", "$insert_id"] as const;
const OFFERING_EVENTS = ["business_offering_management_entered", "business_offering_first_item_saved", "business_offering_catalog_viewed"];

function releaseProperty(source: Properties | undefined): string {
  const release = source?.release;
  return typeof release === "string" && /^[a-f0-9]{40}$/u.test(release) ? release : "unknown";
}

function copyBoundedIdentityProperties(source: Properties | undefined, target: Properties) {
  for (const key of IDENTITY_PROPERTY_KEYS) {
    const value = source?.[key];
    if (typeof value === "string" && value.length <= 200) target[key] = value;
  }
}

/** Drops every field except identity, name, timestamp and the given properties. */
function minimalEvent(event: CaptureResult, properties: Properties): CaptureResult {
  return { uuid: event.uuid, event: event.event, properties, ...(event.timestamp ? { timestamp: event.timestamp } : {}) };
}

function copyQualificationDiagnostics(source: Properties | undefined, target: Properties) {
  const category = source?.failureCategory;
  if (["transport", "http_status", "response_decode", "invalid_response", "unknown"].includes(category)) target.failureCategory = category;
  const httpStatus = source?.httpStatus;
  if (Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) target.httpStatus = httpStatus;
  const trigger = source?.trigger;
  if (["background_refresh", "explicit_refresh", "login_confirmation", "registration_confirmation"].includes(trigger)) target.trigger = trigger;
}

function qualificationFailureEvent(event: CaptureResult): CaptureResult | null {
  const context = Object.hasOwn(qualificationFailures, event.event)
    ? qualificationFailures[event.event as keyof typeof qualificationFailures]
    : undefined;
  const operationId = event.properties?.operationId;
  if (!context || typeof operationId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(operationId)) return null;
  const properties: Properties = {
    ...context, service: "browser", environment: "qualification", outcome: "failed", operationId,
    $process_person_profile: false,
    release: releaseProperty(event.properties),
  };
  copyBoundedIdentityProperties(event.properties, properties);
  copyQualificationDiagnostics(event.properties, properties);
  return minimalEvent(event, properties);
}

function adminRenderFailureEvent(event: CaptureResult): CaptureResult {
  const properties: Properties = {
    component: "AdminError", route: "/admin", service: "browser", outcome: "error",
    $process_person_profile: false,
    environment: ["development", "test", "production", "qualification"].includes(event.properties?.environment)
      ? event.properties.environment
      : "unknown",
    release: releaseProperty(event.properties),
  };
  copyBoundedIdentityProperties(event.properties, properties);
  return minimalEvent(event, properties);
}

function offeringEvent(event: CaptureResult): CaptureResult {
  const { $set, $set_once, ...safeEvent } = event;
  const properties: Properties = {};
  for (const key of IDENTITY_PROPERTY_KEYS) {
    if (typeof event.properties?.[key] === "string") properties[key] = event.properties[key];
  }
  const source = event.properties?.source;
  if (["account", "administration", "business_page"].includes(source)) properties.source = source;
  return { ...safeEvent, properties };
}

function automaticUrlEvent(event: CaptureResult): CaptureResult {
  return {
    ...event,
    ...(event.properties
      ? { properties: sanitizeAutomaticUrlProperties(event.properties) }
      : {}),
    ...(event.$set ? { $set: sanitizeAutomaticUrlProperties(event.$set) } : {}),
    ...(event.$set_once
      ? { $set_once: sanitizeAutomaticUrlProperties(event.$set_once) }
      : {}),
  };
}

export const sanitizeAnalyticsEvent: BeforeSendFn = (event) => {
  if (!event) return event;
  if (qualification) return qualificationFailureEvent(event);
  if (event.event === "admin_render_failed") return adminRenderFailureEvent(event);
  if (OFFERING_EVENTS.includes(event.event)) return offeringEvent(event);
  return automaticUrlEvent(event);
};

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }
}
else if (!host) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
    );
  }
}
// Credential action URLs must not initialize browser capture.
else if (window.location.pathname !== "/minha-conta/acao") {
  posthog.init(projectToken, {
    api_host: host,
    cross_subdomain_cookie: true,
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: !qualification,
    // The Privacy Policy states that sessions are not recorded; masking below only limits a re-enabled replay.
    disable_session_recording: true,
    ...(qualification
      ? {
          autocapture: false, capture_pageview: false, capture_pageleave: false,
          person_profiles: "never" as const,
        }
      : {}),
    before_send: sanitizeAnalyticsEvent,
    session_recording: {
      maskAllInputs: true,
      blockSelector: "[data-private-offering-catalog], [data-private-business-completion]",
      // Replay reads page and request URLs through this hook, outside before_send.
      maskCapturedNetworkRequestFn: request => isPrivateCompletionUrl(request.name)
        ? null
        : { ...request, name: String(sanitizePrivateUrl(request.name)) },
    },
    // Staging console output includes native one-use verification credentials.
    debug: process.env.NODE_ENV === "development",
  });
}
