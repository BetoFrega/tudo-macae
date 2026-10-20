"use client";
import type { RefObject } from "react";

import { useIdentityIntegrations } from "./context";

export type ProfileOperationError = "technical" | "conflict" | "already_created" | "personal_exists";

interface AdvertiserProfileFormAlertsProps {
  invalidFields: string[];
  operationError: ProfileOperationError | null;
  operationErrorRef: RefObject<HTMLDivElement | null>;
  profileId: string | undefined;
  alreadyCreatedProfileId: string | null;
}

export function AdvertiserProfileFormAlerts({
  invalidFields,
  operationError,
  operationErrorRef,
  profileId,
  alreadyCreatedProfileId,
}: AdvertiserProfileFormAlertsProps) {
  const { Link } = useIdentityIntegrations();
  return (
    <>
      {invalidFields.length > 0 && (
        <p
          role="alert"
          className="
            rounded-md border border-destructive p-3 text-sm text-destructive
          "
        >
          Confira os campos:
          {" "}
          {invalidFields.join(", ")}
          .
        </p>
      )}
      {operationError && (
        <div
          ref={operationErrorRef}
          tabIndex={-1}
          role="alert"
          className="space-y-2 rounded-md border border-destructive p-3 text-sm"
        >
          {(operationError === "conflict"
            ? (
                <>
                  <p>Este negócio foi alterado em outra sessão. Seus dados continuam aqui. Compare a versão atual em outra aba antes de salvar suas alterações sobre ela.</p>
                  {profileId && <Link className="underline" href={`/minha-conta/perfis/${profileId}/editar`} target="_blank" rel="noopener noreferrer">Abrir versão atual em outra aba</Link>}
                </>
              )
            : operationError === "already_created"
              ? (
                  <>
                    <p>Este negócio já foi criado nesta tentativa, mas os dados preenchidos agora são diferentes. Seus dados continuam aqui; abra o cadastro salvo em outra aba para comparar antes de editar.</p>
                    {alreadyCreatedProfileId && (
                      <Link
                        className="underline"
                        href={`/minha-conta/perfis/${alreadyCreatedProfileId}/editar`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir negócio salvo em outra aba
                      </Link>
                    )}
                  </>
                )
              : operationError === "personal_exists"
                ? (
                    <p>Sua conta já tem um perfil pessoal. Seus dados continuam aqui; escolha “Um negócio” para criar outro perfil.</p>
                  )
                : (
                    <p>Não foi possível salvar agora. Seus dados continuam aqui. Tente salvar novamente.</p>
                  ))}
        </div>
      )}
    </>
  );
}
