import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { isPublicAdProfileId } from "@tudomacae/ads/publicDiscovery";
import { businessCanonicalPath, businessClaimPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { businessClaimVisible } from "@/integrations/advertiser-identity/businessClaimVisibility";
import { getBusinessUseCase } from "@/packages/classifieds-api";

type BusinessClaimPageProps = PageProps<"/negocio/[id]/[slug]/reivindicar">;

export const metadata: Metadata = {
  title: "Assumir página de negócio | Tudo Macaé",
  robots: { index: false, follow: false },
};

export default async function BusinessClaimPage({ params }: BusinessClaimPageProps) {
  await connection();
  const { id, slug } = await params;
  if (!isPublicAdProfileId(id)) notFound();
  const [business, released] = await Promise.all([getBusinessUseCase({ id }), businessClaimVisible()]);
  if (!released || business?.isClaimable !== true) notFound();
  const claimPath = businessClaimPath(business);
  if (!claimPath.endsWith(`/${slug}/reivindicar`)) permanentRedirect(claimPath);

  return (
    <main className="
      container mx-auto max-w-2xl px-4 py-8
      sm:py-12
    "
    >
      <Link
        href={businessCanonicalPath(business)}
        className="
          inline-flex min-h-11 items-center gap-2 font-medium text-primary
          underline-offset-4
          hover:underline
        "
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para
        {" "}
        {business.title}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        Assumir a página de
        {" "}
        {business.title}
      </h1>
      <p className="mt-4 text-lg/8 text-muted-foreground">
        Ao assumir, você passa a manter as informações e os contatos desta página, vê quantas pessoas visitaram e procuraram o negócio e pode publicar anúncios.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Como funciona</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li>Entre na sua conta do Tudo Macaé.</li>
        <li>Prove que você controla um dos contatos já publicados nesta página.</li>
        <li>A página passa a ser administrada por você.</li>
      </ol>
      <p
        role="status"
        className="mt-8 rounded-lg border border-border p-4 text-sm/relaxed"
      >
        A confirmação do contato ainda está em preparação. Por enquanto, esta etapa não está disponível.
      </p>
    </main>
  );
}
