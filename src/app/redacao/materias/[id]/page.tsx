import { connection } from "next/server";
import { notFound } from "next/navigation";
import { readBlogPost } from "@/features/news/actions/blogActions";
import { ArticleDraftForm } from "@/features/news/components/ArticleDraftForm";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const post = await readBlogPost((await params).id);
  if (!post) notFound();
  return <ArticleDraftForm initialPost={post} />;
}
