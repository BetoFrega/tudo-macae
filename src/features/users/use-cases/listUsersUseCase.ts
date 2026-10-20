import { workerProcedure } from "@/integrations/authentication/authority";

export interface UserRecord {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  createdAt: string | undefined;
  lastSignIn: string | undefined;
  isAdmin: boolean;
  isEditor: boolean;
}

export interface ListUsersResult {
  users: UserRecord[];
  nextPageToken?: string;
}

export async function listUsersUseCase(
  pageToken?: string,
): Promise<ListUsersResult> {
  return workerProcedure<ListUsersResult>("listUsers", { pageToken });
}
