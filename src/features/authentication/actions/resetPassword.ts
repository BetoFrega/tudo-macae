"use server";
import { accountAccess } from "@/integrations/authentication/accountAccess";

export async function resetPassword(oobCode: string, newPassword: string) {
  return accountAccess.resetPassword(oobCode, newPassword);
}
