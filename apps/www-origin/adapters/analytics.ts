import type { WwwOriginLogEvent } from "@tudomacae/www-origin-routing/router";

/** Structurally the Workers Analytics Engine data point, kept free of runtime types. */
interface SignalDataPoint {
  blobs: string[];
  doubles: number[];
  indexes: [string];
}

/**
 * The rollback signal counted without head sampling: failures, whether the
 * Worker detected them or the application answered 5xx, including uncertain writes.
 * Healthy requests return nothing, so volume follows incidents, not traffic.
 * Blob positions are the query contract in docs/agents/www-origin-runbook.md;
 * reordering them breaks saved queries, so the retired revision and journey
 * positions stay empty. Only bounded values are written:
 * never identity, path, query or request id.
 */
function unsampledSignal(event: WwwOriginLogEvent, release: string): SignalDataPoint | undefined {
  if (event.outcome !== "failure") return undefined;
  return {
    indexes: ["failure"],
    blobs: [
      "failure",
      event.failure ?? "",
      event.requestClass,
      event.statusClass,
      release,
      "",
      "",
    ],
    doubles: [1, event.uncertainWrite ? 1 : 0],
  };
}

/** Preserve structured logs and unsampled failure counters independently. */
export function createRoutingTelemetry(options: {
  release: string;
  environment: string;
  log(message: string): void;
  writeDataPoint(point: SignalDataPoint): void;
}) {
  return (event: WwwOriginLogEvent): void => {
    options.log(JSON.stringify({
      event: "www_origin_routed", service: "www-origin-router",
      environment: options.environment, release: options.release, ...event,
      ...(event.requestId ? { correlationId: event.requestId } : {}),
    }));
    const signal = unsampledSignal(event, options.release);
    // Analytics failure must not replace the HTTP response or suppress its log.
    try {
      if (signal) options.writeDataPoint(signal);
    }
    catch {}
  };
}
