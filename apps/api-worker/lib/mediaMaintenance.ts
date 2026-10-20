import { persistenceLimits } from "@tudomacae/editorial-persistence/records";
import { QuarantineSweepIncomplete } from "@tudomacae/media/quarantineCleanup";
import type { EditorialMediaService } from "./mediaHttp";
import type { WorkerDependencies } from "./workerDependencies";

function sweepEvent(env: Env, operationId: string) {
  return { event: "media.quarantine.sweep", service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown", release: env.CF_VERSION_METADATA?.id ?? "unknown", operationId };
}

/** At most 8 pages of 25 per hourly run; more than 200 abandoned uploads per hour would outgrow it. */
async function sweepPages(service: EditorialMediaService) {
  let removed = 0;
  let hasMore = true;
  const failed = new Set<string>();
  let failure: QuarantineSweepIncomplete | undefined;
  for (let page = 0; page < 8 && hasMore; page++) {
    try {
      const result = await service.media.quarantine.sweep(25);
      removed += result.removedReservationIds.length;
      result.removedReservationIds.forEach(id => failed.delete(id));
      hasMore = result.hasMore;
    }
    catch (error) {
      if (!(error instanceof QuarantineSweepIncomplete)) throw error;
      removed += error.removedReservationIds.length;
      hasMore = error.hasMore;
      error.removedReservationIds.forEach(id => failed.delete(id));
      error.failedReservationIds.forEach(id => failed.add(id));
      failure = error;
      // Each page restarts at the earliest due reservation, so a page of failures only would repeat itself.
      if (!error.removedReservationIds.length) break;
    }
  }
  // A reservation that failed on one page and was removed on a later one no longer makes the run partial.
  return { removed, hasMore, failed: failed.size, failure: failed.size ? failure : undefined };
}

/** A partial sweep reports what it cleaned and then fails the run, so the failed reservations stay visible. */
function report(base: ReturnType<typeof sweepEvent>, { removed, hasMore, failed, failure }: Awaited<ReturnType<typeof sweepPages>>) {
  if (failure) {
    console.error(JSON.stringify({ ...base, outcome: "partial", removed, failed, hasMore, errorName: failure.cause instanceof Error ? failure.cause.name : "unknown" }));
    throw failure;
  }
  if (removed || hasMore) console.info(JSON.stringify({ ...base, outcome: "completed", removed, hasMore }));
}

function sweepQuarantine(service: EditorialMediaService, env: Env, operationId: string) {
  const base = sweepEvent(env, operationId);
  return sweepPages(service).then(result => report(base, result), (error: unknown) => {
    if (!(error instanceof QuarantineSweepIncomplete)) console.error(JSON.stringify({ ...base, outcome: "failed", errorName: error instanceof Error ? error.name : "unknown" }));
    throw error;
  });
}

/** At most 8 batches per hourly run; `hasMore` reports a backlog beyond the 512 records one run removes. */
async function expireActivity(service: EditorialMediaService, env: Env, now: number, operationId: string) {
  const base = { ...sweepEvent(env, operationId), event: "editorial.activity.expiry" };
  let expired = 0;
  let hasMore = true;
  try {
    for (let batch = 0; batch < 8 && hasMore; batch++) {
      const removed = await service.persistence.expireActivity(now);
      expired += removed;
      hasMore = removed === persistenceLimits.commands;
    }
  }
  catch (error) {
    console.error(JSON.stringify({ ...base, outcome: "failed", expired, errorName: error instanceof Error ? error.name : "unknown" }));
    throw error;
  }
  if (expired) console.info(JSON.stringify({ ...base, outcome: "completed", expired, hasMore }));
}

/** Hourly editorial upkeep, only once the editorial authority belongs to the Worker; a failure in one task never skips the other. */
export async function runMediaMaintenance(dependencies: WorkerDependencies, env: Env, now: number) {
  const service = dependencies.editorialMedia?.(env);
  if (!service) return;
  const operationId = crypto.randomUUID();
  try {
    if (await service.authority() !== "worker") return;
  }
  catch (error) {
    console.error(JSON.stringify({ ...sweepEvent(env, operationId), event: "editorial.maintenance", outcome: "failed", errorName: error instanceof Error ? error.name : "unknown" }));
    throw error;
  }
  const failure = (await Promise.allSettled([sweepQuarantine(service, env, operationId), expireActivity(service, env, now, operationId)]))
    .find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}
