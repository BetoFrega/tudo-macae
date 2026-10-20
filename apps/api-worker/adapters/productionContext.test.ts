import { afterEach, expect, test, vi } from "vitest";
import type { PhotoDependencies } from "@tudomacae/classifieds-photos";
const fixture = vi.hoisted(() => ({ observers: [] as PhotoDependencies["observe"][] }));
vi.mock("../hostedPhotos", () => ({ createHostedClassifiedsPhotos: (input: { observe: PhotoDependencies["observe"] }) => {
  fixture.observers.push(input.observe);
  return {};
} }));
import { createProductionClassifiedsDependencies } from "../production";
afterEach(() => {
  fixture.observers = [];
  vi.restoreAllMocks();
});
test("photo events retain isolated HTTP and sweep execution contexts", () => {
  const env = { CLASSIFIEDS_DB: {}, WORKERS_ENVIRONMENT: "production", CF_VERSION_METADATA: { id: "fixture" } } as unknown as Parameters<typeof createProductionClassifiedsDependencies>[0];
  const dependencies = createProductionClassifiedsDependencies(env);
  dependencies.classifiedsPhotos!(env, { requestId: "request-one" });
  dependencies.classifiedsPhotos!(env, { sweepOperationId: "sweep-two" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const event = { operation: "cleanup", outcome: "failure", operationId: "photo-intent", cause: "provider" } as const;
  fixture.observers[0]!(event);
  fixture.observers[1]!(event);
  const records = log.mock.calls.map(([value]) => JSON.parse(String(value)));
  expect(records[0]).toMatchObject({ requestId: "request-one", operationId: "photo-intent" });
  expect(records[0]).not.toHaveProperty("sweepOperationId");
  expect(records[1]).toMatchObject({ sweepOperationId: "sweep-two", operationId: "photo-intent" });
  expect(records[1]).not.toHaveProperty("requestId");
});
