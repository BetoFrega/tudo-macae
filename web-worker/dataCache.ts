import { DurableObject } from "cloudflare:workers";
import { MemoryCacheHandler } from "vinext/shims/cache-handler";
import type { CacheHandler } from "vinext/shims/cache-handler";

type Context = Record<string, unknown> | undefined;
type Stub = Pick<CacheHandler, "get" | "set" | "revalidateTag">;
type Namespace = { idFromName(name: string): unknown; get(id: unknown, options?: { locationHint?: string }): Stub };

const binding = "DATA_CACHE";
// The hint only places the object when it is first created; readers are in Brazil.
const locationHint = "sam";

/** Every isolate reads and invalidates the same in-memory cache, so `updateTag` is immediately visible everywhere. Losing the object only costs a cold cache. */
export class DataCache extends DurableObject {
  private readonly cache = new MemoryCacheHandler();

  get(key: string, context: Context) {
    return this.cache.get(key, context);
  }

  set(key: string, data: Parameters<CacheHandler["set"]>[1], context: Context) {
    return this.cache.set(key, data, context);
  }

  revalidateTag(tags: string | string[]) {
    return this.cache.revalidateTag(tags);
  }
}

// RPC carries only structured-cloneable values; these are the fields the handler reads.
function portable(context: Context): Context {
  if (!context) return undefined;
  const { tags, softTags, revalidate, expire, stale, cacheControl } = context;
  return JSON.parse(JSON.stringify({ tags, softTags, revalidate, expire, stale, cacheControl })) as Context;
}

class DurableDataCacheHandler implements CacheHandler {
  constructor(private readonly namespace: Namespace) {}

  private stub() {
    return this.namespace.get(this.namespace.idFromName("data-cache"), { locationHint });
  }

  get(key: string, context?: Record<string, unknown>) {
    return this.stub().get(key, portable(context));
  }

  set(key: string, data: Parameters<CacheHandler["set"]>[1], context?: Record<string, unknown>) {
    return this.stub().set(key, data, portable(context));
  }

  revalidateTag(tags: string | string[]) {
    return this.stub().revalidateTag(tags);
  }
}

export default function createDurableDataCache({ env }: { env?: Record<string, unknown> }): CacheHandler {
  const namespace = env?.[binding] as Namespace | undefined;
  if (!namespace) throw new Error(`The data cache requires the \`${binding}\` Durable Object binding.`);
  return new DurableDataCacheHandler(namespace);
}
