import { afterEach, expect, test, vi } from "vitest";
import { boundedDiagnosticRead } from "./boundedDiagnosticRead";

afterEach(() => vi.useRealTimers());

test("a stalled diagnostic returns a deadline outcome without consuming the assertion budget", async () => {
  vi.useFakeTimers();
  let outcome: unknown;
  void boundedDiagnosticRead(() => new Promise<never>(() => {}), 1000).then((result) => {
    outcome = result;
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(outcome).toEqual({ outcome: "deadline" });
  expect(vi.getTimerCount()).toBe(0);
});

test("a completed diagnostic retains its value and clears the deadline", async () => {
  vi.useFakeTimers();
  await expect(boundedDiagnosticRead(async () => "offAir", 1000)).resolves.toEqual({ outcome: "completed", value: "offAir" });
  expect(vi.getTimerCount()).toBe(0);
});

test("a failed diagnostic exposes only its finite outcome", async () => {
  vi.useFakeTimers();
  await expect(boundedDiagnosticRead(() => {
    throw new Error("private diagnostic failure");
  }, 1000)).resolves.toEqual({ outcome: "failed" });
  expect(vi.getTimerCount()).toBe(0);
});

test("a late rejection after the deadline stays handled", async () => {
  vi.useFakeTimers();
  let rejectRead!: (error: Error) => void;
  const reading = boundedDiagnosticRead(() => new Promise<never>((_resolve, reject) => {
    rejectRead = reject;
  }), 1000);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(reading).resolves.toEqual({ outcome: "deadline" });
  rejectRead(new Error("late private diagnostic failure"));
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("an exhausted diagnostic budget skips the read", async () => {
  const read = vi.fn(async () => "offAir");
  await expect(boundedDiagnosticRead(read, 0)).resolves.toEqual({ outcome: "deadline" });
  expect(read).not.toHaveBeenCalled();
});
