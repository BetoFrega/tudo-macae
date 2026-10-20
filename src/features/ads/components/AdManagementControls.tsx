"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DeleteAdButton } from "./DeleteAdButton";
import { EditAdButton } from "./EditAdButton";
import { useAdManagementPermission } from "./useAdManagementPermission";

export function AdManagementControls({ adId }: { adId: string }) {
  const permission = useAdManagementPermission(adId);
  const confirmationOpen = useRef(false);
  const recovering = useRef(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!permission.unavailable && recovering.current) {
      document.getElementById(`ad-description-${adId}`)?.focus();
      recovering.current = false;
    }
    if (!permission.allowed && confirmationOpen.current) {
      (permission.unavailable ? retryButton.current : document.getElementById(`ad-description-${adId}`))?.focus();
      confirmationOpen.current = false;
    }
  }, [permission.allowed, permission.unavailable, adId]);
  const recover = () => {
    recovering.current = true;
    permission.retry();
  };
  if (permission.unavailable) return (
    <div role="status">
      <p>Não foi possível confirmar suas permissões.</p>
      <Button ref={retryButton} type="button" variant="outline" onClick={recover}>Tentar novamente</Button>
    </div>
  );
  const onDialogOpenChange = (open: boolean) => {
    confirmationOpen.current = open;
  };
  return permission.allowed ? <Controls adId={adId} onDialogOpenChange={onDialogOpenChange} /> : null;
}

function Controls({ adId, onDialogOpenChange }: { adId: string; onDialogOpenChange?: ((open: boolean) => void) | undefined }) {
  return (
    <>
      <EditAdButton adId={adId} />
      <DeleteAdButton adId={adId} onDialogOpenChange={onDialogOpenChange} />
    </>
  );
}
