"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLoginModal } from "@/features/authentication/LoginModalContext";

/** After sign-in the claim page renders again with the account's claim form. */
export function BusinessClaimSignIn() {
  const { openLoginModal } = useLoginModal();
  const router = useRouter();
  return (
    <Button type="button" className="mt-4 min-h-11" onClick={event => openLoginModal(() => router.refresh(), undefined, "claim-business", event.currentTarget)}>
      Entrar para pedir
    </Button>
  );
}
