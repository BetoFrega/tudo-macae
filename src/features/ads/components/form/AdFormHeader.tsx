import { CheckCircle2, Megaphone } from "lucide-react";
import { CardDescription, CardHeader } from "@/components/ui/card";

export function AdFormHeader({ isEditing }: { isEditing: boolean }) {
  return (
    <CardHeader className="
      gap-4 border-b px-5 py-6
      sm:p-8
    "
    >
      <div className="flex items-start gap-4">
        <div className="
          mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl
          bg-primary text-primary-foreground shadow-sm
        "
        >
          <Megaphone className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="
            text-2xl/tight font-bold tracking-tight
            sm:text-3xl
          "
          >
            {isEditing ? "Editar Anúncio" : "Publicar Anúncio"}
          </h1>
          <CardDescription className="max-w-xl text-base/relaxed">
            {isEditing
              ? "Revise as informações abaixo e salve quando tudo estiver certo."
              : "Conte o que você está oferecendo. A publicação é gratuita e fica fácil de encontrar nos classificados."}
          </CardDescription>
        </div>
      </div>
      {!isEditing && (
        <div className="
          flex items-center gap-2 text-sm font-medium text-primary
        "
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Publique grátis em poucos minutos
        </div>
      )}
    </CardHeader>
  );
}
