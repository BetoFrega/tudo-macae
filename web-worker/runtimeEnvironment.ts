import { env } from "cloudflare:workers";
import { workerRevision } from "./runtimeIdentity";

// Runs before the app's modules, which read the revision when their diagnostics start.
const revision = workerRevision(env);
if (revision) process.env.K_REVISION ??= revision;
