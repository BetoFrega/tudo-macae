"use client";
import { Button } from "@tudomacae/react-primitives/button";
import { useEffect, useRef, useState } from "react";
import type { AdvertiserIdentityType } from "../../model";
import { useProfileCommands } from "./context";
import { IdentityTypeField, identityTypeLabels, useIdentityTypeChoice } from "./IdentityTypeField";

type ClassificationError = "personal_exists" | "already_classified" | "technical";

const errorMessages: Record<ClassificationError, string> = {
  personal_exists: "Sua conta já tem um perfil pessoal. Defina este perfil como “Um negócio”.",
  already_classified: "O tipo deste perfil já foi definido em outra sessão. Recarregue a página para ver o tipo atual.",
  technical: "Não foi possível definir o tipo agora. Tente novamente.",
};

interface IdentityTypeClassificationProps {
  profileId: string | undefined;
  identityTypes: { current?: AdvertiserIdentityType; personalAvailable: boolean } | undefined;
}

/** Renders only for an existing profile where types are supported. */
export function IdentityTypeClassification({ profileId, identityTypes }: IdentityTypeClassificationProps) {
  if (!profileId || !identityTypes) return null;
  return <Classification profileId={profileId} {...identityTypes} />;
}

/** Confirms a fixed type separately from saving the other profile fields. */
function Classification({ profileId, current, personalAvailable }: { profileId: string; current?: AdvertiserIdentityType; personalAvailable: boolean }) {
  const commands = useProfileCommands();
  const [classified, setClassified] = useState(current);
  const choice = useIdentityTypeChoice({ enabled: true, personalAvailable });
  const [error, setError] = useState<ClassificationError | null>(null);
  const [busy, setBusy] = useState(false);
  const [justClassified, setJustClassified] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // The confirmed choice replaces the focused button, so focus moves to the announced result.
  useEffect(() => {
    if (justClassified) resultRef.current?.focus();
  }, [justClassified]);

  async function classify() {
    if (!choice.confirm()) return;
    const identityType = choice.value!;
    setBusy(true);
    setError(null);
    try {
      const result = await commands.classifyAdvertiserProfile(profileId, identityType);
      if (result.success) {
        setClassified(identityType);
        setJustClassified(true);
        commands.navigation.refresh();
        return;
      }
      if (result.outcome === "personal_exists") choice.personalTaken();
      setError(result.outcome);
    }
    catch {
      setError("technical");
    }
    finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="identity-type-heading"
      className="mb-6 space-y-3 rounded-md border p-4"
    >
      <h2 id="identity-type-heading" className="text-base font-semibold">Tipo do perfil</h2>
      {classified
        ? <p ref={resultRef} tabIndex={-1} role="status" className="text-sm">{identityTypeLabels[classified]}</p>
        : (
            <>
              <p className="text-sm text-muted-foreground">Defina se este perfil representa você ou um negócio. Os demais dados do perfil não mudam.</p>
              {error && (
                <p
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="rounded-md border border-destructive p-3 text-sm"
                >
                  {errorMessages[error]}
                </p>
              )}
              <IdentityTypeField {...choice.fieldProps} disabled={busy} />
              <Button type="button" onClick={classify} disabled={busy}>{busy ? "Definindo..." : "Definir tipo"}</Button>
            </>
          )}
    </section>
  );
}
