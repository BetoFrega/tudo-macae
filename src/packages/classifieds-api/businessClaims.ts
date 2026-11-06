import type { createBusinessClaims } from "@tudomacae/advertiser-identity/businessClaim";
import { route } from "./route";

type Claims = ReturnType<typeof createBusinessClaims>;
type Submission = Omit<Parameters<Claims["submit"]>[0], "actor"> & { operationId: string };
type Review = Omit<Parameters<Claims["review"]>[0], "actor">;

/** The Worker resolves the actor from the session; callers never name it. */
export const businessClaims = {
  readOwn: route<(businessId: string) => ReturnType<Claims["readOwn"]>>("claims.own", businessId => ({ businessId })),
  submit: route<(input: Submission) => ReturnType<Claims["submit"]>>("claims.submit", input => input, true),
  listPending: route<() => ReturnType<Claims["listPending"]>>("claims.pending", () => ({})),
  review: route<(input: Review) => ReturnType<Claims["review"]>>("claims.review", input => input, true),
};
