import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { formatSaoPauloDateTime } from "@tudomacae/civil-time";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { businessClaims } from "@/packages/classifieds-api/businessClaims";
import { BusinessClaimReviewForm } from "@/features/business-claim/BusinessClaimReviewForm";

export const metadata: Metadata = { title: "Pedidos para assumir negócios | Tudo Macaé" };

function formatCnpj(digits: string) {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/u, "$1.$2.$3/$4-$5");
}

/** The admin layout already refuses non-administrators; the Worker rechecks the role on every call. */
export default async function BusinessClaimReviewPage() {
  await connection();
  const pending = await businessClaims.listPending();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Pedidos para assumir negócios</h2>
        <p className="mt-2 max-w-prose text-muted-foreground">
          O CNPJ é público, então ele sozinho não prova nada. Antes de aprovar, ligue para o telefone publicado na página do negócio ou confira se o e-mail ou o telefone do CNPJ na Receita batem com os da conta.
        </p>
      </div>
      {pending.length === 0 && <p role="status">Nenhum pedido em análise.</p>}
      {pending.map(entry => (
        <section
          key={entry.businessId}
          aria-labelledby={`claims-${entry.businessId}`}
          className="space-y-4 rounded-lg border border-border p-4"
        >
          <h3
            id={`claims-${entry.businessId}`}
            className="text-lg font-semibold"
          >
            <Link
              href={businessCanonicalPath({ id: entry.businessId, title: entry.title })}
              className="text-primary underline underline-offset-4"
            >
              {entry.title || entry.businessId}
            </Link>
          </h3>
          {entry.claims.length > 1 && (
            <p className="font-medium">
              {entry.claims.length}
              {" "}
              pessoas pediram este negócio. Ao aprovar uma, as outras são recusadas.
            </p>
          )}
          <ul className="space-y-6">
            {entry.claims.map(claim => (
              <li
                key={claim.id}
                className="space-y-3 border-t border-border pt-4"
              >
                <dl className="
                  grid gap-x-4 gap-y-1
                  sm:grid-cols-[auto_1fr]
                "
                >
                  <dt className="font-medium">Nome</dt>
                  <dd>{claim.responsibleName}</dd>
                  <dt className="font-medium">E-mail confirmado da conta</dt>
                  <dd>{claim.claimantEmail}</dd>
                  <dt className="font-medium">CNPJ</dt>
                  <dd>{formatCnpj(claim.evidence.cnpj)}</dd>
                  <dt className="font-medium">Enviado em</dt>
                  <dd>{formatSaoPauloDateTime(claim.submittedAt)}</dd>
                  {claim.note && (
                    <>
                      <dt className="font-medium">Mensagem</dt>
                      <dd className="whitespace-pre-line">{claim.note}</dd>
                    </>
                  )}
                </dl>
                <BusinessClaimReviewForm businessId={entry.businessId} claimId={claim.id} revision={entry.revision} operationId={crypto.randomUUID()} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
