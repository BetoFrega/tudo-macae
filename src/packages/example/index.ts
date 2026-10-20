import { calculateSummary } from "./lib/impl";

export interface NumberSummary {
  count: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
}

export function summarizeNumbers(values: readonly number[]): NumberSummary {
  return calculateSummary(values);
}
