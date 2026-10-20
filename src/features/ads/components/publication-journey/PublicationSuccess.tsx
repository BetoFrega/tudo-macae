import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PublicationSuccess({ published, title }: { published: { adId: string; slug: string }; title: string | undefined }) {
  return (
    <section className="
      space-y-5 p-5
      sm:p-8
    "
    >
      <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />
      <h2
        id="publication-success"
        tabIndex={-1}
        className="text-xl font-semibold"
      >
        Seu anúncio está publicado
      </h2>
      <p className="wrap-break-word">{title}</p>
      <Button asChild><Link href={`/anuncio/${published.adId}/${published.slug}`}>Ver anúncio</Link></Button>
      <nav
        aria-label="Depois da publicação"
        className="flex flex-wrap gap-5 text-sm text-primary"
      >
        <Link
          href={`/anuncio/${published.adId}/editar`}
          className="underline underline-offset-4"
        >
          Editar anúncio
        </Link>
        <Link
          href="/minha-conta/anuncios"
          className="underline underline-offset-4"
        >
          Meus anúncios
        </Link>
      </nav>
      <p className="text-sm text-muted-foreground">Este link pode ser compartilhado e aberto por qualquer pessoa:</p>
      <Link
        href={`/anuncio/${published.adId}/${published.slug}`}
        className="
          block text-sm break-all text-primary underline underline-offset-4
        "
      >
        {`/anuncio/${published.adId}/${published.slug}`}
      </Link>
    </section>
  );
}
