import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { isPublicAdProfileId } from "@tudomacae/ads/publicDiscovery";
import { businessCanonicalPath, businessClaimPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { businessClaimVisible } from "@/integrations/advertiser-identity/businessClaimVisibility";
import { getBusinessUseCase } from "@/packages/classifieds-api";
import { businessClaims } from "@/packages/classifieds-api/businessClaims";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { BusinessClaimForm } from "@/features/business-claim/BusinessClaimForm";
import { BusinessClaimSignIn } from "@/features/business-claim/BusinessClaimSignIn";
import { formatSaoPauloDate } from "@tudomacae/civil-time";
import type { OwnBusinessClaim } from "@tudomacae/advertiser-identity/businessClaim";

type BusinessClaimPageProps = PageProps<"/negocio/[id]/[slug]/reivindicar">;

export const metadata: Metadata = {
  title: "Assumir página de negócio | Tudo Macaé",
  robots: { index: false, follow: false },
};

/** Only a released claim of a claimable Business exists; any other request is not found. */
async function claimableBusiness(id: string, slug: string) {
  if (!isPublicAdProfileId(id)) notFound();
  const [business, released] = await Promise.all([getBusinessUseCase({ id }), businessClaimVisible()]);
  if (!released || business?.isClaimable !== true) notFound();
  const claimPath = businessClaimPath(business);
  if (!claimPath.endsWith(`/${slug}/reivindicar`)) permanentRedirect(claimPath);
  return business;
}

export default async function BusinessClaimPage({ params }: BusinessClaimPageProps) {
  await connection();
  const { id, slug } = await params;
  const business = await claimableBusiness(id, slug);
  const user = await getCurrentUser();
  const own = user?.emailVerified ? await businessClaims.readOwn(business.id) : null;

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
        <li>Entre na sua conta do Tudo Macaé, com o e-mail confirmado.</li>
        <li>Envie o CNPJ do negócio.</li>
        <li>Nossa equipe confere o pedido, por exemplo ligando para o telefone publicado nesta página.</li>
        <li>Aprovado o pedido, a página passa a ser administrada pela sua conta.</li>
      </ol>
      <section
        aria-labelledby="business-claim-request-title"
        className="mt-10 border-t border-border pt-8"
      >
        <h2 id="business-claim-request-title" className="text-xl font-semibold">Seu pedido</h2>
        <ClaimRequest businessId={business.id} signedIn={Boolean(user)} emailVerified={user?.emailVerified === true} claim={own?.claim ?? null} />
      </section>
    </main>
  );
}

function ClaimRequest({ businessId, signedIn, emailVerified, claim }: { businessId: string; signedIn: boolean; emailVerified: boolean; claim: OwnBusinessClaim | null }) {
  if (!signedIn) {
    return (
      <>
        <p className="mt-3">Para pedir esta página, entre na sua conta ou crie uma.</p>
        <BusinessClaimSignIn />
      </>
    );
  }
  if (!emailVerified) {
    return (
      <p className="mt-3">
        Confirme o e-mail da sua conta antes de pedir esta página.
        {" "}
        <Link
          href="/minha-conta/verificar-email"
          className="font-medium text-primary underline underline-offset-4"
        >
          Confirmar e-mail
        </Link>
      </p>
    );
  }
  if (claim?.status === "pending") {
    return (
      <p role="status" className="mt-3 rounded-lg border border-border p-4">
        Seu pedido está em análise desde
        {" "}
        {formatSaoPauloDate(claim.submittedAt)}
        . Vamos avisar no e-mail da sua conta.
      </p>
    );
  }
  return (
    <>
      {claim?.status === "rejected" && (
        <div className="mt-3 rounded-lg border border-border p-4">
          <p className="font-medium">Seu pedido anterior não foi aprovado.</p>
          {claim.reason && <p className="mt-1 text-muted-foreground">{claim.reason}</p>}
          <p className="mt-1">Você pode enviar um novo pedido.</p>
        </div>
      )}
      <BusinessClaimForm businessId={businessId} operationId={crypto.randomUUID()} />
    </>
  );
}
