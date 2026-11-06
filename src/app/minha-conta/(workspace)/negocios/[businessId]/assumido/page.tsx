import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { getAdvertiserProfile } from "@/features/advertiser-profile/actions/getAdvertiserProfile";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";

export const metadata: Metadata = { title: "Negócio assumido | Tudo Macaé", robots: { index: false, follow: false } };

/** The welcome after an approved claim; only the Business's owner can open it. */
export default async function ClaimedBusinessPage({ params }: PageProps<"/minha-conta/negocios/[businessId]/assumido">) {
  await connection();
  const { businessId } = await params;
  const business = await getAdvertiserProfile(businessId);
  if (!business) notFound();
  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        Agora você administra
        {" "}
        {business.title}
      </h1>
      <p className="mt-4 text-lg/8 text-muted-foreground">
        A página continua no catálogo com as informações de antes. Confira se estão certas e publique um anúncio para aparecer também nos Classificados.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Próximos passos</h2>
      <ul className="
        mt-4 grid gap-3
        sm:grid-cols-2
      "
      >
        <li>
          <Button asChild className="min-h-11 w-full">
            <Link href="/publicar">Publicar o primeiro anúncio</Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={`/minha-conta/perfis/${business.id}/editar`}>Conferir as informações</Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={businessCanonicalPath(business)}>Ver a página pública</Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href="/minha-conta/perfis">Meus negócios</Link>
          </Button>
        </li>
      </ul>
    </main>
  );
}
