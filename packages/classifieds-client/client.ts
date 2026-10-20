import { z } from "zod";
import { ClassifiedsRequestError, type ClassifiedsReadOperation, type ClassifiedsWriteOperation } from "./protocol";
import { remoteClassifiedsError } from "./lib/remoteErrors";
import { checkProtocol, classifiedsHeaders, classifiedsRequestId, parseServiceOrigin, unexpectedStatusError, type ClassifiedsCredential } from "./lib/transport";

export type { ClassifiedsCredential } from "./lib/transport";

type ClassifiedsOperation = ClassifiedsReadOperation | ClassifiedsWriteOperation;

// Aggregate taxonomy writes include multiple transactions and Business catalog reads scan every Profile page, unlike bounded CRUD.
const aggregateOperations: readonly ClassifiedsOperation[] = ["categories.seed", "categories.delete", "subcategories.delete", "profiles.identity.preview", "profiles.identity.delete", "business.list", "business.sitemap", "business.preview", "business.areas"];

const resultSchema = z.object({ result: z.object({ data: z.unknown() }) });

/** Reads travel as a GET query string; writes as a POST body. */
function trpcCall(operation: ClassifiedsOperation, input: unknown, mutation: boolean) {
  const body = JSON.stringify({ operation, input: input ?? null });
  const endpoint = `/api/trpc/${mutation ? "classifiedsWrite" : "classifiedsRead"}`;
  return mutation
    ? { path: endpoint, init: { method: "POST", body } }
    : { path: `${endpoint}?input=${encodeURIComponent(body)}`, init: { method: "GET" } };
}

export function createClassifiedsClient(configuration: { origin: string; publicOrigin: string; allowLocal?: boolean; request?: typeof fetch }) {
  const origin = parseServiceOrigin(configuration, "Destino de Classificados inválido.");
  const publicOrigin = new URL(configuration.publicOrigin).origin;
  async function send(operation: ClassifiedsOperation, input: unknown, mutation: boolean, headers: Headers, requestId: string) {
    const call = trpcCall(operation, input, mutation);
    if (mutation) headers.set("content-type", "application/json");
    const timeout = aggregateOperations.includes(operation) ? 30_000 : 5_000;
    try {
      return await (configuration.request ?? fetch)(new URL(call.path, origin), {
        ...call.init, headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(timeout),
      });
    }
    catch { throw new ClassifiedsRequestError("unavailable", requestId); }
  }
  async function invoke<T>(operation: ClassifiedsOperation, input: unknown, mutation: boolean, credential: ClassifiedsCredential = {}, correlationId: string = crypto.randomUUID()): Promise<T> {
    const requestId = classifiedsRequestId(correlationId);
    const headers = classifiedsHeaders(publicOrigin, requestId, credential);
    const response = await send(operation, input, mutation, headers, requestId);
    const serverReportedFailure = checkProtocol(response, requestId);
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw remoteClassifiedsError(value) ?? unexpectedStatusError(response.status, requestId, serverReportedFailure);
    const result = resultSchema.safeParse(value);
    if (!result.success) throw new ClassifiedsRequestError("incompatible", requestId, serverReportedFailure);
    return result.data.result.data as T;
  }
  return {
    read<T>(operation: ClassifiedsReadOperation, input: unknown, credential?: ClassifiedsCredential, correlationId?: string) {
      return invoke<T>(operation, input, false, credential, correlationId);
    },
    write<T>(operation: ClassifiedsWriteOperation, input: unknown, credential?: ClassifiedsCredential, correlationId?: string) {
      return invoke<T>(operation, input, true, credential, correlationId);
    },
  };
}
