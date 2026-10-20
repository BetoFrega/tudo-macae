import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { readPublicBlogPage } from "@/packages/editorial/publicBlogProduction";
import { editorialListingLeadImageUrl } from "@/integrations/public-images/editorial";
import { EditorialImage } from "@/integrations/public-images/EditorialImage";
import { MediaFigure } from "@tudomacae/media/figure";
import { formatSaoPauloDateTime } from "@tudomacae/civil-time";
import { createOpenGraph } from "@/lib/socialMetadata";

const title = "Blog | Tudo Macaé";
const description = "Registros e publicações do Tudo Macaé.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/noticias" },
  openGraph: createOpenGraph({ title, description, url: "/noticias" }),
};

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  await connection();
  const page = await readPublicBlogPage((await searchParams).cursor);
  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">Blog</h1>
      {page.items.length === 0 && <p>Nenhum post nesta página.</p>}
      <ul className="
        grid gap-6
        sm:grid-cols-2
        lg:grid-cols-3
      "
      >
        {page.items.map((article) => {
          const { lead } = article;
          const href = `/noticia/${article.id}/${article.slug}`;
          return (
            <li key={article.id} className="overflow-hidden rounded-md border" data-testid="news-card">
              {lead && <MediaFigure caption={lead.caption} credit={lead.credit}><EditorialImage src={editorialListingLeadImageUrl(article, lead, `/noticia/${article.id}/midias/${lead.id}`)} alt={lead.alt} width={600} height={400} /></MediaFigure>}
              <div className="space-y-2 p-4">
                <h2>
                  <Link
                    href={href}
                    className="
                      inline-flex min-h-11 items-center text-lg font-semibold
                      underline
                    "
                  >
                    {article.title}
                  </Link>
                </h2>
                {article.publishedAt !== undefined && <p>{formatSaoPauloDateTime(article.publishedAt)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {page.nextCursor && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          href={`/noticias?cursor=${encodeURIComponent(page.nextCursor)}`}
        >
          Próxima página
        </Link>
      )}
    </main>
  );
}
