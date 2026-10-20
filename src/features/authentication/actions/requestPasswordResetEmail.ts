"use server";
import { accountAccess } from "@/integrations/authentication/accountAccess";

export async function requestPasswordResetEmail(input: { email: string; challengeToken?: string }) {
  return accountAccess.requestPasswordResetEmail(input);
}
