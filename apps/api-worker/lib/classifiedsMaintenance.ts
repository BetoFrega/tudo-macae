import { classifiedsFailureCause } from "../diagnostics";
import type { WorkerDependencies } from "./workerDependencies";

function maintenanceEvent(env: Env, event: string, operationId: string) {
  return {
    event, service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown",
    release: env.CF_VERSION_METADATA?.id ?? "unknown", operationId,
  };
}

async function isQualified(dependencies: WorkerDependencies) {
  try {
    return (await dependencies.classifiedsQualification?.()) === true;
  }
  catch {
    // An unavailable preparation control keeps maintenance closed.
    return false;
  }
}

/** Logs a task's failure under its own event and rethrows it; `run` returns the fields of a completion worth logging. */
async function runTask(env: Env, event: string, operationId: string, run: () => Promise<Record<string, unknown> | undefined>) {
  try {
    const completed = await run();
    if (completed) console.info(JSON.stringify({ ...maintenanceEvent(env, event, operationId), outcome: "completed", ...completed }));
  }
  catch (error) {
    console.error(JSON.stringify({ ...maintenanceEvent(env, event, operationId), outcome: "failed", causeCode: classifiedsFailureCause(error) }));
    throw error;
  }
}

function sweepPhotos(dependencies: WorkerDependencies, env: Env, operationId: string) {
  const photos = dependencies.classifiedsPhotos;
  if (!photos) return;
  return runTask(env, "classifieds.photos.sweep", operationId, async () => {
    const result = await photos(env, { sweepOperationId: operationId }).sweep(25);
    return result.attempted || result.pending ? result : undefined;
  });
}

/** Audits carry their own `expiresAt`; nothing else deletes them once Classifieds data lives in D1. */
function expireAudits(dependencies: WorkerDependencies, env: Env, operationId: string, now: number) {
  const persistence = dependencies.classifiedsPersistence;
  if (!persistence) return;
  return runTask(env, "classifieds.audits.expiry", operationId, async () => {
    const expired = await persistence(env).expireAudits(now);
    return expired ? { expired } : undefined;
  });
}

/** Writes the day's sanitized supply snapshot on the first hourly run of each Macaé day. */
function exportSupplySnapshot(dependencies: WorkerDependencies, env: Env, operationId: string, now: number) {
  const snapshot = dependencies.classifiedsSupplySnapshot;
  if (!snapshot) return;
  return runTask(env, "classifieds.supply.snapshot", operationId, async () => {
    const result = await snapshot(env)?.run(now);
    return result?.written ? result : undefined;
  });
}

/** One hourly trigger qualifies once and runs every task under one operation id; a failure in one never skips the others. */
export async function runClassifiedsMaintenance(dependencies: WorkerDependencies, env: Env, now: number) {
  const operationId = crypto.randomUUID();
  if (!(await isQualified(dependencies))) return;
  const failure = (await Promise.allSettled([sweepPhotos(dependencies, env, operationId), expireAudits(dependencies, env, operationId, now), exportSupplySnapshot(dependencies, env, operationId, now)]))
    .find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}
