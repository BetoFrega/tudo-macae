"use client";

import { useRouter } from "next/navigation";
import { BusinessCreationCta as View, BusinessCreationButton as ButtonView, type BusinessCreationButtonProps } from "@tudomacae/advertiser-identity/discovery";
import type { ReactNode } from "react";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { useAuth } from "@/features/authentication/AuthContext";
import { useLoginModal } from "@/features/authentication/LoginModalContext";

function CreationIntegration({ children, returnFocusTargetId }: { children: ReactNode; returnFocusTargetId?: string | undefined }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { openLoginModal } = useLoginModal();
  return (
    <IdentityIntegration commands={{ creationCta: {
      signedIn: Boolean(user), loading,
      navigate: path => router.push(path),
      requestSignIn: continuation => openLoginModal(continuation, undefined, "create-business", returnFocusTargetId ? document.getElementById(returnFocusTargetId) : undefined),
    } }}
    >
      {children}
    </IdentityIntegration>
  );
}

export function BusinessCreationCta(props: { promoted?: boolean }) {
  return <CreationIntegration><View {...props} /></CreationIntegration>;
}

export function BusinessCreationButton({ returnFocusTargetId, ...props }: BusinessCreationButtonProps & { returnFocusTargetId?: string }) {
  return <CreationIntegration returnFocusTargetId={returnFocusTargetId}><ButtonView {...props} /></CreationIntegration>;
}
