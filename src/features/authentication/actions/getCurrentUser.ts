"use server";
import { readCurrentUserForRender } from "@/integrations/authentication/renderSessionReader";

export async function getCurrentUser() {
  return readCurrentUserForRender();
}
