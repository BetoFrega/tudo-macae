import type { NumberSummary } from "../index";

export function calculateSummary(values: readonly number[]): NumberSummary {
  if (values.length === 0) {
    return { count: 0, minimum: null, maximum: null, average: null };
  }

  let minimum = values[0]!;
  let maximum = values[0]!;
  let total = 0;

  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    total += value;
  }

  return {
    count: values.length,
    minimum,
    maximum,
    average: total / values.length,
  };
}
