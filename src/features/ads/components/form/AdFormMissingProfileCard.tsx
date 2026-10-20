import { UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export function AdFormMissingProfileCard({ profileManagementHref }: { profileManagementHref?: string | undefined }) {
  const canManageProfiles = !!profileManagementHref;
  return (
    <Card className="mx-auto max-w-lg bg-background shadow-md">
      <CardHeader className="items-center text-center">
        <div className="
          flex size-12 items-center justify-center rounded-xl bg-primary/10
          text-primary
        "
        >
          <UserRound className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {canManageProfiles ? "Crie um Perfil de Anunciante" : "Anunciante sem perfil disponível"}
        </h1>
        <CardDescription className="max-w-sm text-base">
          {canManageProfiles
            ? "O perfil mostra quem está anunciando e como as pessoas podem entrar em contato com você."
            : "Não é possível salvar este anúncio até que o proprietário tenha um perfil de anunciante."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManageProfiles && (
          <Button asChild size="lg" className="w-full">
            <Link href={`${profileManagementHref}/novo`}>Criar Perfil</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
