import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { getAdvertiserProfile } from "@/features/advertiser-profile/actions/getAdvertiserProfile";
import { assessBusinessUseCase } from "@/packages/classifieds-api";
import { businessCanonicalPath, businessMissingRequirements } from "@tudomacae/advertiser-identity/businessPresentation";
import { CompletionHeading } from "./CompletionHeading";

export default function BusinessCompletionPage({
  params,
}: PageProps<"/minha-conta/perfis/[profileId]/concluido">) {
  return (
    <Suspense fallback={<Loading role="status" aria-live="polite" />}>
      <BusinessCompletion params={params} />
    </Suspense>
  );
}

async function BusinessCompletion({
  params,
}: Pick<PageProps<"/minha-conta/perfis/[profileId]/concluido">, "params">) {
  await connection();
  const { profileId } = await params;
  const profile = await getAdvertiserProfile(profileId);
  if (!profile) notFound();

  const readiness = await assessBusinessUseCase(profile);
  return (
    <main
      data-private-business-completion="true"
      className="container mx-auto px-4 py-10"
    >
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CompletionHeading title={profile.title} />
        </CardHeader>
        <CardContent className="space-y-6">
          {readiness.business
            ? <p>Seu negócio já aparece no catálogo.</p>
            : (
                <p>
                  Cadastro salvo, mas o negócio ainda não aparece no catálogo. Falta:
                  {" "}
                  {businessMissingRequirements(readiness.missing)}
                  .
                </p>
              )}
          <div className="
            grid gap-3
            sm:grid-cols-2
          "
          >
            {readiness.business
              ? (
                  <Button asChild>
                    <Link href={businessCanonicalPath(readiness.business)}>Ver negócio</Link>
                  </Button>
                )
              : (
                  <Button asChild>
                    <Link href={`/minha-conta/perfis/${profile.id}/editar`}>Completar cadastro</Link>
                  </Button>
                )}
            <Button asChild variant="outline">
              <Link href="/minha-conta/perfis">Meus negócios</Link>
            </Button>
            <Button asChild variant="outline" className="sm:col-span-2">
              <Link href="/negocios">Voltar ao catálogo</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
