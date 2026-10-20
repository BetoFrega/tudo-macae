"use client";
import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@tudomacae/react-primitives/button";
import { useLoginModal } from "./LoginModalContext";
export function Unauthorized() {
  const { openLoginModal, registerDefaultOnSuccess } = useLoginModal();
  useEffect(() => registerDefaultOnSuccess(() => window.location.reload()), [registerDefaultOnSuccess]);
  return (
    <div className={`
      flex h-[calc(100vh-6rem)] flex-col items-center justify-center
    `}
    >
      <h1 className="mb-2 text-2xl font-bold">Falta pouco!</h1>
      <p className="mb-16 text-muted-foreground">
        Você precisa se autenticar para ver essa página.
      </p>
      <Button
        onClick={() => openLoginModal()}
      >
        Fazer login
        {" "}
        <LogIn className="ml-2 size-4" />
      </Button>
    </div>
  );
}
