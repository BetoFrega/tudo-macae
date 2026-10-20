import { afterAll, beforeAll } from "vitest";
import { registerClassifiedsCases } from "./tests/classifiedsCases";
import { registerDeliveryCases } from "./tests/deliveryCases";
import { registerEditorialCases } from "./tests/editorialCases";
import { registerProfileCases } from "./tests/profileCases";
import { startRuntime, stopRuntime } from "./tests/runtimeFixture";

beforeAll(startRuntime, 60_000);
afterAll(stopRuntime);

registerClassifiedsCases();
registerDeliveryCases();
registerEditorialCases();
registerProfileCases();
