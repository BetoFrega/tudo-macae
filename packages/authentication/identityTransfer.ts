import z from "zod";
export const transferIdentitySchema = z
  .object({
    uid: z.string().min(1).max(128),
    email: z.email().transform(value => value.toLowerCase()),
    emailVerified: z.boolean(),
    disabled: z.boolean(),
    claims: z.record(z.string(), z.unknown()),
    createdAt: z.number().int().nonnegative(),
    displayName: z.string().optional(),
    lastSignIn: z.number().int().nonnegative().optional(),
    verificationAttempt: z
      .object({
        nextSendAt: z.number().int().nonnegative(),
        error: z.string().max(4096).optional(),
        pendingEmail: z.email().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TransferIdentity = z.input<typeof transferIdentitySchema>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
function identities(input: TransferIdentity[]) {
  const records = input.map(record => transferIdentitySchema.parse(record));
  if (
    new Set(records.map(record => record.uid)).size !== records.length
      || new Set(records.map(record => record.email)).size !== records.length
  )
    throw new Error("Identity reconciliation has duplicate UIDs or addresses");
  return records;
}
export function createIdentityTransfer(dependencies: {
  readAuthority(): Promise<{ phase: string; revision: number }>;
  readIdentities(): Promise<TransferIdentity[]>;
  importIdentities(records: TransferIdentity[]): Promise<void>;
  activate(revision: number): Promise<boolean>;
}) {
  async function preparing() {
    const state = await dependencies.readAuthority();
    if (state.phase !== "preparing")
      throw new Error("Authentication authority active or unavailable");
    return state;
  }
  return {
    async prepare(input: TransferIdentity[]) {
      await preparing();
      const records = identities(input);
      await dependencies.importIdentities(records);
      return { imported: records.length };
    },
    async activate(input: TransferIdentity[]) {
      const state = await preparing();
      const expected = new Map(
        identities(input).map(record => [record.uid, record]),
      );
      const actual = identities(await dependencies.readIdentities());
      const comparable = (record: TransferIdentity) =>
        JSON.stringify(
          canonical({
            ...record,
            displayName: record.displayName ?? "",
            lastSignIn: record.lastSignIn ?? null,
            verificationAttempt: record.verificationAttempt ?? {
              nextSendAt: 0,
            },
          }),
        );
      if (
        actual.length !== expected.size
        || actual.some(
          record =>
            !expected.has(record.uid)
            || comparable(record) !== comparable(expected.get(record.uid)!),
        )
      )
        throw new Error("Identity reconciliation failed");
      if (!(await dependencies.activate(state.revision)))
        throw new Error("Identity reconciliation changed or authority active");
      return { activated: true, reconciled: actual.length };
    },
  };
}
