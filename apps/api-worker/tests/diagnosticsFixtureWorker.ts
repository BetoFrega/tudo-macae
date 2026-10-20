import { createApiWorker } from "../index";
import { createClassifiedsPersistence } from "../classifieds";
import type { AuthenticationDiagnosticEvent } from "@tudomacae/authentication/diagnostics";
import { createLocalJWKSet, type JSONWebKeySet } from "jose";

const events: AuthenticationDiagnosticEvent[] = [];
let identityVerifications = 0;
const fixture = {
  async fetch(request: Request, env: Env & { TEST_SERVICE_KEYS: JSONWebKeySet }, execution: ExecutionContext) {
    if (new URL(request.url).pathname === "/__diagnostics") return Response.json(events.splice(0));
    if (new URL(request.url).pathname === "/__identity-verifications") {
      const count = identityVerifications;
      identityVerifications = 0;
      return Response.json({ count });
    }
    const fault = request.headers.get("x-fixture-fault");
    const diagnosticsEnabled = request.headers.get("x-fixture-diagnostics") !== "off";
    let keepAliveJobs = 0;
    const context = new Proxy(execution, {
      get(target, property) {
        if (property === "waitUntil") return (promise: Promise<unknown>) => {
          keepAliveJobs++;
          target.waitUntil(promise);
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const database = new Proxy(env.AUTHENTICATION_DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.includes("authentication_authority")) return statement;
          return new Proxy(statement, {
            get(statementTarget, operation) {
              if (operation === "first" && fault === "authority") return async () => {
                throw new Error("private-authority-sentinel");
              };
              if (operation === "first" && fault === "closed") return async () => ({ phase: "preparing" });
              if (operation === "first" && fault === "timeout") return async () => {
                await new Promise(resolve => setTimeout(resolve, 5500));
                return await statementTarget.first();
              };
              return Reflect.get(statementTarget, operation).bind(statementTarget);
            },
          });
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await createApiWorker({
      classifiedsPersistence: () => createClassifiedsPersistence({ database: env.CLASSIFIEDS_DB }),
      serviceKeys: async (header, token) => {
        identityVerifications++;
        if (fault === "runtime_identity_hung") await new Promise(() => {});
        if (fault === "runtime_identity_delayed") {
          const delayed = new Promise<void>(resolve => setTimeout(resolve, 5500));
          execution.waitUntil(delayed);
          await delayed;
        }
        return await createLocalJWKSet(env.TEST_SERVICE_KEYS)(header, token);
      },
      ...(diagnosticsEnabled ? { writeDiagnostic: (event: AuthenticationDiagnosticEvent) => events.push(event) } : {}),
      sampleDiagnosticSuccess: () => true,
    }).fetch(request, { ...env, AUTHENTICATION_DB: database, AUTHENTICATION_DIAGNOSTICS_ENABLED: diagnosticsEnabled ? "true" : "false" }, context);
    response.headers.set("x-fixture-keep-alive-jobs", String(keepAliveJobs));
    return response;
  },
};

export default fixture;
