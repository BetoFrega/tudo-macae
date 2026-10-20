import { createContextKey, type Context, type TextMapGetter, type TextMapSetter, type TextMapPropagator } from "@opentelemetry/api";
import { edgeRequestIdHeader, requestCorrelationId, requestCorrelationIdHeader } from "./contract";

export const requestCorrelationContextKey = createContextKey("tudomacae.request.correlation");

/** Extract only the bounded edge-owned identifier; no baggage or private headers enter context. */
export class RequestCorrelationPropagator implements TextMapPropagator {
  fields() { return [edgeRequestIdHeader, requestCorrelationIdHeader]; }
  extract<Carrier>(context: Context, carrier: Carrier, getter: TextMapGetter<Carrier>): Context {
    for (const name of this.fields()) {
      const value = getter.get(carrier, name);
      const id = requestCorrelationId(typeof value === "string" ? value : undefined);
      if (id) return context.setValue(requestCorrelationContextKey, id);
    }
    return context;
  }

  inject<Carrier>(context: Context, carrier: Carrier, setter: TextMapSetter<Carrier>): void {
    const value = context.getValue(requestCorrelationContextKey);
    const id = requestCorrelationId(typeof value === "string" ? value : undefined);
    if (id) setter.set(carrier, requestCorrelationIdHeader, id);
  }
}
