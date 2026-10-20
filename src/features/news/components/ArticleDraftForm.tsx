"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker } from "@/integrations/media/MediaComponents";
import { createMedia } from "@/features/media/createMedia";
import { getMediaOptionById, getMediaOptions } from "@/features/media/actions/getMediaOptions";
import { saveBlogPost, takeBlogPostOffline } from "../actions/blogActions";
import type { BlogPost, SavePostInput } from "@tudomacae/editorial-blog/blog";

type LeadMediaId = string | null | undefined;
type SaveResult = Awaited<ReturnType<typeof saveBlogPost>>;
type SaveSuccess = Extract<SaveResult, { success: true }>;
type MutationFailure = Extract<SaveResult | Awaited<ReturnType<typeof takeBlogPostOffline>>, { success: false }>;

function initialFields(post: BlogPost | null) {
  return {
    title: post?.content.title ?? "",
    body: post?.content.body ?? "",
    leadMediaId: post?.content.leadMediaId,
  };
}

function saveInput(post: BlogPost | null, fields: { title: string; body: string; leadMediaId: LeadMediaId }, publish?: boolean): SavePostInput {
  const { title, body, leadMediaId } = fields;
  return { ...(post ? { id: post.id, expectedRevision: post.revision } : {}), title, body,
    ...(leadMediaId !== undefined ? { leadMediaId } : {}), ...(publish ? { publish } : {}) };
}

function saveSuccessMessage(result: SaveSuccess) {
  if (result.synchronization === "unconfirmed") return "Post salvo. A atualização da listagem ou do cache de imagens não foi confirmada.";
  if (result.post.status !== "published") return "Rascunho salvo.";
  return (result.post.publishedAt ?? 0) > Date.now() ? "Post salvo. Agendamento antigo mantido." : "Post publicado.";
}

function coverStatus(leadMediaId: LeadMediaId, post: BlogPost | null) {
  if (leadMediaId) return "Capa selecionada.";
  if (leadMediaId === null) return "Sem capa.";
  return post?.mediaIds.length ? "Imagens antigas preservadas." : "Sem capa.";
}

function hasCover(leadMediaId: LeadMediaId, post: BlogPost | null) {
  return Boolean(leadMediaId || (leadMediaId === undefined && !!post?.mediaIds.length));
}

function LeadMediaSection({ leadMediaId, post, errorField, errorId, onLeadMediaChange }: {
  leadMediaId: LeadMediaId;
  post: BlogPost | null;
  errorField: string | undefined;
  errorId: string;
  onLeadMediaChange: (leadMediaId: string | null) => void;
}) {
  return (
    <section className="space-y-3" aria-label="Capa opcional" aria-describedby={errorField === "leadMediaId" ? errorId : undefined}>
      <h3 className="font-semibold">Capa opcional</h3>
      <MediaPicker kind="article-image" loadAction={getMediaOptions} resolveAction={getMediaOptionById} onCreateAction={createMedia} onSelectAction={media => onLeadMediaChange(media.id)} triggerLabel="Escolher capa" />
      <p>{coverStatus(leadMediaId, post)}</p>
      {hasCover(leadMediaId, post) && <Button type="button" variant="outline" onClick={() => onLeadMediaChange(null)}>Remover capa</Button>}
    </section>
  );
}

function DraftActions({ post, pending, onPublish, onTakeOffline }: {
  post: BlogPost | null;
  pending: boolean;
  onPublish: () => void;
  onTakeOffline: () => void;
}) {
  const published = post?.status === "published";
  return (
    <>
      {published && <p>{post.scheduled ? "Agendamento antigo mantido. Você pode editar ou retirar do ar." : "Ao salvar, as alterações ficam públicas imediatamente."}</p>}
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-11" type="submit">{pending ? "Salvando…" : published ? "Salvar alterações" : "Salvar rascunho"}</Button>
        {!published && <Button className="min-h-11" type="button" onClick={onPublish}>Publicar</Button>}
        {published && <Button className="min-h-11" type="button" variant="outline" onClick={onTakeOffline}>Retirar do ar</Button>}
      </div>
    </>
  );
}

function DraftLinks({ post }: { post: BlogPost | null }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {post?.status === "published" && !post.scheduled && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          href={post.content.path}
        >
          Ver post publicado
        </Link>
      )}
      <Link className="inline-flex min-h-11 items-center underline" href="/redacao/materias">Voltar aos posts</Link>
    </div>
  );
}

export function ArticleDraftForm({ initialPost }: { initialPost: BlogPost | null }) {
  const router = useRouter();
  const fieldPrefix = `post-${initialPost?.id ?? "new"}`;
  const titleId = `${fieldPrefix}-title`;
  const bodyId = `${fieldPrefix}-body`;
  const errorId = `${fieldPrefix}-error`;
  const formatId = `${fieldPrefix}-format`;
  const initial = initialFields(initialPost);
  const [post, setPost] = useState(initialPost);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [leadMediaId, setLeadMediaId] = useState<LeadMediaId>(initial.leadMediaId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string>();
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [pending, startTransition] = useTransition();
  function beginMutation(progress: string) {
    setError("");
    setMessage(progress);
    setErrorField(undefined);
  }
  function reportFailure(result: MutationFailure) {
    // Without a field to correct, the write may have landed, unless the action says none started.
    if (!result.field && !("retryable" in result && result.retryable)) setNeedsConfirmation(true);
    setError(result.error);
    setErrorField(result.field);
    setMessage("");
  }
  function reportUnconfirmed(unconfirmed: string) {
    setNeedsConfirmation(true);
    setMessage("");
    setError(unconfirmed);
  }
  function save(publish?: boolean) {
    beginMutation("Salvando…");
    startTransition(async () => {
      try {
        const result = await saveBlogPost(saveInput(post, { title, body, leadMediaId }, publish));
        if (!result.success) {
          reportFailure(result);
          return;
        }
        setPost(result.post);
        setMessage(saveSuccessMessage(result));
        if (!post) router.replace(`/redacao/materias/${result.post.id}`);
      }
      catch {
        reportUnconfirmed("Não foi possível salvar. Reabra o post para conferir seu estado antes de tentar novamente.");
      }
    });
  }
  function takeOffline() {
    if (!post) return;
    beginMutation("Retirando do ar…");
    startTransition(async () => {
      try {
        const result = await takeBlogPostOffline({ id: post.id, expectedRevision: post.revision });
        if (!result.success) {
          reportFailure(result);
          return;
        }
        setPost(result.post);
        setMessage(result.synchronization === "unconfirmed" ? "Post retirado do ar. A atualização da listagem ou do cache de imagens não foi confirmada." : "Post retirado do ar. Conteúdo preservado.");
      }
      catch {
        reportUnconfirmed("Não foi possível retirar do ar. Reabra o post para conferir seu estado.");
      }
    });
  }
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h2 className="text-2xl font-bold">{post ? "Editar post" : "Novo post"}</h2>
      {error && <p id={errorId} role="alert">{error}</p>}
      <p role="status" aria-live="polite">{message}</p>
      <fieldset disabled={pending || needsConfirmation} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor={titleId}>Título</label>
          <Input id={titleId} aria-invalid={errorField === "title" || undefined} aria-describedby={errorField === "title" ? errorId : undefined} required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label htmlFor={bodyId}>Texto</label>
          <p
            id={formatId}
            className="text-sm text-muted-foreground"
          >
            Use **negrito**, *itálico*, listas e [texto](link). A formatação e imagens antigas são preservadas.
          </p>
          <Textarea id={bodyId} aria-invalid={errorField === "body" || undefined} aria-describedby={errorField === "body" ? `${formatId} ${errorId}` : formatId} required maxLength={200000} rows={18} value={body} onChange={event => setBody(event.target.value)} />
        </div>
        <LeadMediaSection leadMediaId={leadMediaId} post={post} errorField={errorField} errorId={errorId} onLeadMediaChange={setLeadMediaId} />
        <DraftActions post={post} pending={pending} onPublish={() => save(true)} onTakeOffline={takeOffline} />
      </fieldset>
      <DraftLinks post={post} />
    </form>
  );
}
