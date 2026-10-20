import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { useAdFormLogic } from "../../hooks/useAdFormLogic";

type PartialUpload = NonNullable<ReturnType<typeof useAdFormLogic>["partialUpload"]>;

interface AdFormPartialUploadCardProps {
  partialUpload: PartialUpload;
  isEditing: boolean;
  loading: boolean;
  retryPendingUploads: () => Promise<void>;
}

function nextStepText(partialUpload: PartialUpload) {
  if (partialUpload.authenticationRequired) return "Entre na sua conta para enviar as fotos pendentes ou veja o anúncio salvo.";
  if (partialUpload.invalidPhoto) return "Edite as fotos do anúncio salvo para escolher outra imagem. As fotos pendentes desta tela não serão levadas para a edição; selecione novamente as que deseja enviar.";
  if (partialUpload.rateLimitError) return "Veja o anúncio salvo ou aguarde para enviar as fotos pendentes.";
  return "Tente enviar apenas as fotos pendentes ou veja o anúncio salvo.";
}

function PartialUploadAlert({ partialUpload }: { partialUpload: PartialUpload }) {
  const rejection = partialUpload.rateLimitError ?? partialUpload.invalidPhoto?.error;
  if (rejection) return (
    <p
      role="alert"
      className="text-sm font-medium text-destructive"
    >
      {rejection}
    </p>
  );
  if (!partialUpload.retryFailed || partialUpload.authenticationRequired) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      As fotos pendentes ainda não foram enviadas. Tente novamente ou veja o anúncio salvo.
    </p>
  );
}

// A rejected photo cannot succeed on retry, so the saved ad's editor replaces the retry action.
function PartialUploadAction({ partialUpload, loading, retryPendingUploads }: Omit<AdFormPartialUploadCardProps, "isEditing">) {
  if (partialUpload.invalidPhoto) {
    return (
      <Button
        asChild
        className="h-auto min-h-11 max-w-full text-center whitespace-normal"
      >
        <a href={partialUpload.invalidPhoto.editUrl}>Editar fotos do anúncio salvo</a>
      </Button>
    );
  }
  return (
    <Button type="button" onClick={() => void retryPendingUploads()} disabled={loading}>
      {loading ? "Enviando fotos..." : partialUpload.authenticationRequired ? "Entrar e enviar fotos" : "Tentar enviar fotos novamente"}
    </Button>
  );
}

export function AdFormPartialUploadCard({ partialUpload, isEditing, loading, retryPendingUploads }: AdFormPartialUploadCardProps) {
  const partialHeadingRef = useRef<HTMLHeadingElement>(null);
  const partialUrl = partialUpload.url;

  useEffect(() => {
    if (partialUrl) partialHeadingRef.current?.focus();
  }, [partialUrl]);

  return (
    <Card className="mx-auto max-w-3xl bg-background shadow-md">
      <CardHeader>
        <h1
          ref={partialHeadingRef}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight"
        >
          {isEditing ? "Alterações salvas; fotos pendentes" : "Anúncio salvo; fotos pendentes"}
        </h1>
        <CardDescription role="status" className="text-base">
          {isEditing ? "As alterações do anúncio foram salvas." : "O anúncio foi salvo."}
          {" "}
          {partialUpload.pendingNames.length === 1 ? "Uma foto ainda não foi enviada." : `${partialUpload.pendingNames.length} fotos ainda não foram enviadas.`}
          {" "}
          {nextStepText(partialUpload)}
          <span className="mt-2 block">Fotos pendentes:</span>
          <ul className="list-inside list-disc">
            {partialUpload.pendingNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
          </ul>
        </CardDescription>
        <PartialUploadAlert partialUpload={partialUpload} />
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <PartialUploadAction partialUpload={partialUpload} loading={loading} retryPendingUploads={retryPendingUploads} />
        <Button asChild variant="outline"><Link href={partialUpload.url}>Ver anúncio salvo</Link></Button>
      </CardContent>
    </Card>
  );
}
