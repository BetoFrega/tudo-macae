"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { adminDeleteAdvertiserIdentity, previewAdminAdvertiserIdentityDeletion } from "../actions/adminDeleteAdvertiserIdentity";
import type { IdentityDeletionPreview } from "@tudomacae/advertiser-identity/identityDeletion";

export function AdminDeleteAdvertiserIdentity({ profileId, disabled }: { profileId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<IdentityDeletionPreview>();
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const router = useRouter();

  async function loadPreview() {
    setOpen(true);
    setLoading(true);
    setPreview(undefined);
    setError("");
    setTitle("");
    key.current = crypto.randomUUID();
    try {
      setPreview(await previewAdminAdvertiserIdentityDeletion(profileId));
    }
    catch { setError("Não foi possível conferir o perfil. Tente novamente."); }
    finally { setLoading(false); }
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!preview) return;
    setLoading(true);
    setError("");
    try {
      const result = await adminDeleteAdvertiserIdentity({
        id: profileId, confirmedTitle: title, reason,
        confirmationToken: preview.confirmationToken, idempotencyKey: key.current,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/perfis");
      router.refresh();
      setOpen(false);
    }
    catch {
      setError("Não foi possível excluir. Se o conteúdo mudou, atualize a prévia e confirme novamente.");
    }
    finally { setLoading(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => { if (!loading) setOpen(value); }}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" className="w-full" disabled={disabled} onClick={loadPreview}>Excluir perfil</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Excluir perfil definitivamente</DialogTitle>
            <DialogDescription>O perfil, seus anúncios e seu catálogo serão apagados. Esta ação não pode ser desfeita. A conta de acesso será preservada.</DialogDescription>
          </DialogHeader>
          {loading && <p role="status">Aguarde…</p>}
          {error && <p role="alert">{error}</p>}
          {preview && (
            <form onSubmit={remove}>
              <p className="font-semibold">{preview.title}</p>
              <p>
                {preview.ads.length}
                {" "}
                anúncios ou publicações pendentes;
                {" "}
                {preview.catalogItems.length}
                {" "}
                itens de catálogo.
              </p>
              {preview.ads.length > 0 && (
                <ul className="my-3 list-inside list-disc">
                  {preview.ads.map(ad => <li key={ad.id}>{ad.title || "Publicação pendente"}</li>)}
                </ul>
              )}
              {preview.catalogItems.length > 0 && (
                <ul className="my-3 list-inside list-disc" aria-label="Itens de catálogo que serão excluídos">
                  {preview.catalogItems.map(item => <li key={item.id}>{item.name}</li>)}
                </ul>
              )}
              <div className="mt-4 space-y-2">
                <Label htmlFor="identity-deletion-reason">Motivo da exclusão</Label>
                <Textarea id="identity-deletion-reason" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={loading} />
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="identity-deletion-title">Digite o nome do perfil para confirmar</Label>
                <Input id="identity-deletion-title" required={preview.title.length > 0} value={title} onChange={event => setTitle(event.target.value)} disabled={loading} autoComplete="off" />
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" disabled={loading} onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={loading || title !== preview.title || !reason.trim()}>Confirmar exclusão</Button>
              </DialogFooter>
            </form>
          )}
          {error && <Button type="button" variant="outline" disabled={loading} onClick={loadPreview}>Atualizar prévia</Button>}
        </DialogContent>
      </Dialog>
    </>
  );
}
