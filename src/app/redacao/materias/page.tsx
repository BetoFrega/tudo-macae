import Link from "next/link";
import { connection } from "next/server";
import { listBlogPosts } from "@/features/news/actions/blogActions";

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  await connection();
  const page = await listBlogPosts((await searchParams).cursor);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Posts</h2>
        <Link className="inline-flex min-h-11 items-center underline" href="/redacao/materias/nova">Novo post</Link>
      </div>
      {page.items.length === 0 && <p>Nenhum post nesta página.</p>}
      <ul className="divide-y rounded-md border">
        {page.items.map(post => (
          <li key={post.id} className="p-4">
            <Link className="inline-flex min-h-11 items-center underline" href={`/redacao/materias/${post.id}`}>{post.title}</Link>
            <p>{post.status === "published" ? post.scheduled ? "Agendado (legado)" : "Publicado" : "Rascunho"}</p>
          </li>
        ))}
      </ul>
      {page.nextCursor && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          href={`/redacao/materias?cursor=${encodeURIComponent(page.nextCursor)}`}
        >
          Próxima página
        </Link>
      )}
    </section>
  );
}
