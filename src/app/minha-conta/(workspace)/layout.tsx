import type { ReactNode } from "react";
import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  if (!await getCurrentUser()) unauthorized();
  return children;
}
