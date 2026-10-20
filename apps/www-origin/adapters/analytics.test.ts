import { expect, test, vi } from "vitest";
import { createRoutingTelemetry } from "./analytics";

test("logs every request but counts only failures without high-cardinality or private data", () => {
  const log = vi.fn();
  const writeDataPoint = vi.fn();
  const record = createRoutingTelemetry({ release: "version-1", environment: "production", log, writeDataPoint });
  record({ outcome: "success", requestClass: "document", statusClass: "2xx", requestId: "0123456789abcdef-GRU" });
  record({ outcome: "success", requestClass: "document", statusClass: "4xx" });
  expect(writeDataPoint).not.toHaveBeenCalled();
  record({ outcome: "failure", requestClass: "action", statusClass: "5xx", failure: "terms-worker-unavailable",
    uncertainWrite: true, requestId: "0123456789abcdef-GRU" });
  expect(writeDataPoint.mock.calls).toEqual([[{
    indexes: ["failure"],
    blobs: ["failure", "terms-worker-unavailable", "action", "5xx", "version-1", "", ""],
    doubles: [1, 1],
  }]]);
  expect(JSON.stringify(writeDataPoint.mock.calls)).not.toContain("0123456789abcdef-GRU");
  expect(JSON.parse(log.mock.calls[2]![0])).toMatchObject({ event: "www_origin_routed", service: "www-origin-router",
    environment: "production", release: "version-1", requestId: "0123456789abcdef-GRU", uncertainWrite: true });
  record({ outcome: "failure", requestClass: "document", statusClass: "5xx" });
  expect(writeDataPoint.mock.calls[1]).toEqual([{
    indexes: ["failure"], blobs: ["failure", "", "document", "5xx", "version-1", "", ""], doubles: [1, 0],
  }]);
});

test("an Analytics outage keeps the failure log and does not escape into routing", () => {
  const log = vi.fn();
  const record = createRoutingTelemetry({ release: "version-1", environment: "production", log,
    writeDataPoint() { throw new Error("dataset unavailable"); } });
  expect(() => record({ outcome: "failure", requestClass: "action", statusClass: "5xx", uncertainWrite: true })).not.toThrow();
  expect(log).toHaveBeenCalledOnce();
});
