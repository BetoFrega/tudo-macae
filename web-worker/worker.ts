// The Worker entry wraps vinext's handler and declares the shared data cache object.
// Outbound routing loads first so the fetch that vinext and the app wrap is the routed one.
import "./outboundBindings";
import "./runtimeEnvironment";
import handler from "vinext/server/fetch-handler";
import { withResponsePolicy } from "./responsePolicy";
import { withWorkerVersion } from "./workerVersion";

export * from "vinext/server/fetch-handler";
export default withWorkerVersion(withResponsePolicy(handler));
export { DataCache } from "./dataCache";
