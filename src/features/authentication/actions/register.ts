"use server";
import { accountAccess } from "@/integrations/authentication/accountAccess";
import type { AccountCredentials } from "@tudomacae/authentication/account-access";

export async function register(input: AccountCredentials) {
  return accountAccess.register(input);
}
