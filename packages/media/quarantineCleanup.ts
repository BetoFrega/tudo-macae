import { buildQuarantineCleanup } from "./lib/quarantineCleanup";

export { QuarantineSweepIncomplete } from "./lib/quarantineCleanup";

export interface QuarantineCleanupRecord {
  cleanupPending: boolean;
  cleanupAt: number;
  status: string;
}
export interface QuarantineCleanupDependencies {
  now(): number;
  remove(id: string): Promise<void>;
  store: {
    candidates(deadline: number, limit: number): Promise<string[]>;
    transact(id: string, decide: (transaction: { read(): Promise<QuarantineCleanupRecord>; expire(): void }) => Promise<boolean>): Promise<boolean>;
    markRemoved(id: string, cleanedAt: number): Promise<void>;
  };
}
export function createQuarantineCleanup(dependencies: QuarantineCleanupDependencies) {
  return buildQuarantineCleanup(dependencies);
}
