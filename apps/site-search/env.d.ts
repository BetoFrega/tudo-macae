/* eslint-disable */
interface __BaseEnv_Env {
  AI_SEARCH: AiSearchInstance;
  WORKER_VERSION?: { id: string };
  OIDC_AUDIENCE: string;
  OIDC_SERVICE_ACCOUNT: string;
}
declare namespace Cloudflare {
  interface Env extends __BaseEnv_Env {}
}
interface Env extends __BaseEnv_Env {}
