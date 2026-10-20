import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";

export async function authorizeCategoryManagement() {
  const user = await getCurrentUser();

  if (!user) unauthorized();
  if (!user.isAdmin) forbidden();
}
