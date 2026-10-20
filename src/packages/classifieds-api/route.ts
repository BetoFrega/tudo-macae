import { cookies } from "next/headers.js";
import { serviceIdentityToken } from "@tudomacae/authentication-client/server";
import { createClassifiedsClient } from "@tudomacae/classifieds-client/client";
import type { ClassifiedsReadOperation, ClassifiedsWriteOperation } from "@tudomacae/classifieds-client/protocol";
type Machine = { actorId: string; correlationId: string };

const publicReads: readonly string[] = ["categories.catalog", "categories.list", "subcategories.list", "subcategories.resolve", "profiles.public", "profiles.area", "ads.forProfile", "ads.read", "ads.page", "ads.sitemap", "business.read", "business.list", "business.sitemap", "business.preview", "business.areas", "offerings.public", "offerings.available"];

/** The API Worker is the only Classifieds authority; it rejects every call while its own durable authority is not `worker`. */
export function route<F extends (...args: never[]) => Promise<unknown>>(operation: ClassifiedsReadOperation | ClassifiedsWriteOperation, input: (...args: Parameters<F>) => unknown, mutation = false, machine?: Machine, observeWorker?: (execute: () => Promise<Awaited<ReturnType<F>>>, args: Parameters<F>, requestId: string) => Promise<Awaited<ReturnType<F>>>) {
  return async (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => {
    const requestId = machine?.correlationId ?? crypto.randomUUID();
    const invokeWorker = async (): Promise<Awaited<ReturnType<F>>> => {
      const origin = process.env.AUTHENTICATION_API_URL;
      if (!origin || !process.env.PUBLIC_APP_ORIGIN) throw new Error("Classifieds authority configuration missing");
      const client = createClassifiedsClient({ origin, publicOrigin: process.env.PUBLIC_APP_ORIGIN, allowLocal: true });
      const credential = machine ? { service: { token: await serviceIdentityToken(origin), actorId: machine.actorId } } : publicReads.includes(operation) ? {} : { session: (await cookies()).get("session")?.value };
      const value = input(...args);
      return mutation
        ? client.write<Awaited<ReturnType<F>>>(operation as ClassifiedsWriteOperation, value, credential, requestId)
        : client.read<Awaited<ReturnType<F>>>(operation as ClassifiedsReadOperation, value, credential, requestId);
    };
    return observeWorker ? await observeWorker(invokeWorker, args, requestId) : await invokeWorker();
  };
}
