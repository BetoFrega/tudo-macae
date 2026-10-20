// The runner and TypeScript loader initialize before effects are trapped.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^(@google-cloud|next(?:\/|$))/.test(specifier)) throw new Error(`Infrastructure initialization: ${specifier}`);
    return nextResolve(specifier, context);
  },
});
const forbidden = () => {
  throw new Error("Incidental infrastructure effect in protected module");
};
globalThis.fetch = forbidden;
globalThis.WebSocket = forbidden;
const { run } = await import(process.argv[3]);
const entry = await import(process.argv[2]);
const { factory, operations = [] } = JSON.parse(process.argv[4] ?? "{}");
const executed = new Set();
const observed = { ...entry };
if (factory) {
  if (typeof entry[factory] !== "function") throw new Error(`Missing factory: ${factory}`);
  observed[factory] = (...args) => {
    const instance = entry[factory](...args);
    for (const name of operations) {
      if (typeof instance[name] !== "function") throw new Error(`Missing operation: ${name}`);
    }
    return new Proxy(instance, {
      get(target, name, receiver) {
        const value = Reflect.get(target, name, receiver);
        if (!operations.includes(name)) return value;
        return async (...inputs) => {
          const result = await value.apply(target, inputs);
          executed.add(name);
          return result;
        };
      },
    });
  };
}
await run(observed);
for (const name of operations) {
  if (!executed.has(name)) throw new Error(`Protected operation was not exercised: ${name}`);
}
