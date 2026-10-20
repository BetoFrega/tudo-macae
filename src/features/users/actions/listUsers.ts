"use server";

import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  type ListUsersResult,
  listUsersUseCase,
} from "../use-cases/listUsersUseCase";

export async function listUsers(pageToken?: string): Promise<ListUsersResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  if (!currentUser?.isAdmin) return forbidden();

  return await listUsersUseCase(pageToken);
}
