import { runClassifiedsMaintenance } from "./classifiedsMaintenance";
import { runMediaMaintenance } from "./mediaMaintenance";
import { runBlogIndexReconciliation } from "./editorialIndexReconciliation";
import type { WorkerDependencies } from "./workerDependencies";

/** Runs every capability's scheduled work; a failure in one never skips the others, and the first one fails the run. */
export async function runScheduledMaintenance(dependencies: WorkerDependencies, env: Env, scheduledTime: number) {
  const failure = (await Promise.allSettled([Promise.resolve(dependencies.expireAuthentication?.(env, scheduledTime)), runClassifiedsMaintenance(dependencies, env, scheduledTime), runMediaMaintenance(dependencies, env, scheduledTime), runBlogIndexReconciliation(dependencies, env)]))
    .find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}
