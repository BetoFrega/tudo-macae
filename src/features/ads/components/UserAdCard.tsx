"use client";

import { formatSaoPauloDate } from "@tudomacae/civil-time";
import { AdImage } from "./AdImage";
import { Edit, MoreVertical, Pause, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteAd } from "../actions/deleteAd";
import { updateAdStatus } from "../actions/updateAdStatus";
import type { AdStatus } from "@tudomacae/ads/types";
import type { AdActivationIssueDetails } from "../activationRecovery";
import { AdActivationFeedback } from "./AdActivationFeedback";
import { UserAdStatusBadge, UserAdStatusConfirmation } from "./UserAdCardStatus";

interface UserAdCardProps {
  id: string;
  title: string;
  slug: string;
  category: string;
  subcategory: string;
  text: string;
  status: AdStatus;
  createdAt: number;
  imageUrl?: string | undefined;
}

export function UserAdCard({
  id,
  title,
  slug,
  category,
  subcategory,
  text,
  status,
  createdAt,
  imageUrl,
}: UserAdCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [activationIssue, setActivationIssue] = useState<AdActivationIssueDetails | null>(null);
  const [statusConfirmation, setStatusConfirmation] = useState("");
  const statusRequestPending = useRef(false);

  const date = createdAt
    ? formatSaoPauloDate(createdAt)
    : "Data desconhecida";

  const handleStatusChange = async () => {
    if (statusRequestPending.current) return;
    statusRequestPending.current = true;
    setIsUpdatingStatus(true);
    setActivationIssue(null);
    setStatusConfirmation("");
    try {
      const newStatus = status === "active" ? "paused" : "active";
      const result = await updateAdStatus(id, newStatus);
      if (!result.success) {
        const { success: _success, ...issue } = result;
        setActivationIssue(issue);
        return;
      }
      setStatusConfirmation(result.status === "active" ? "Anúncio ativo." : "Anúncio pausado.");
      router.refresh();
    }
    catch (error) {
      console.error("Error updating ad status:", error);
      setActivationIssue({
        reason: "technical",
        error: "Não foi possível atualizar o anúncio. Tente novamente.",
        adId: id,
      });
    }
    finally {
      setIsUpdatingStatus(false);
      statusRequestPending.current = false;
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteAd(id);
      setDeleteDialogOpen(false);
      router.refresh();
    }
    catch (error) {
      console.error("Error deleting ad:", error);
      setDeleteError("Não foi possível excluir o anúncio. Tente novamente.");
    }
    finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card
        data-testid="user-ad-card"
        className={`
          flex h-full flex-col overflow-hidden transition-shadow duration-200
          hover:shadow-lg
        `}
      >
        {imageUrl && (
          <AdImage
            src={imageUrl}
            alt={title}
          />
        )}
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-x-2">
              <Badge variant="secondary">{category}</Badge>
              <span className="text-xs font-medium">{subcategory}</span>
            </div>
            <div className="flex items-center gap-2">
              <UserAdStatusBadge status={status} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreVertical className="size-4" />
                    <span className="sr-only">Abrir menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/anuncio/${id}/editar`}
                      className="cursor-pointer"
                    >
                      <Edit className="mr-2 size-4" />
                      Editar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleStatusChange}
                    disabled={isUpdatingStatus}
                    className="cursor-pointer"
                  >
                    {status === "active"
                      ? (
                          <>
                            <Pause className="mr-2 size-4" />
                            Pausar
                          </>
                        )
                      : (
                          <>
                            <Play className="mr-2 size-4" />
                            Ativar
                          </>
                        )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setDeleteError("");
                      setDeleteDialogOpen(true);
                    }}
                    className={`
                      cursor-pointer text-destructive
                      focus:text-destructive
                    `}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Link href={`/anuncio/${id}/${slug}`} className="block">
            <h3
              className={`
                mb-2 line-clamp-2 text-lg font-semibold transition-colors
                hover:text-primary
              `}
            >
              {title}
            </h3>
            <p
              className={`
                line-clamp-3 leading-relaxed whitespace-pre-wrap
                text-muted-foreground
              `}
            >
              {text}
            </p>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">{date}</p>
          {activationIssue && (
            <div className="mt-4">
              <AdActivationFeedback
                issue={activationIssue}
                onRetry={handleStatusChange}
                busy={isUpdatingStatus}
              />
            </div>
          )}
          {statusConfirmation && <UserAdStatusConfirmation message={statusConfirmation} href={`/anuncio/${id}/${slug}`} />}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Anúncio</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este anúncio? Esta ação não pode
              ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Excluindo..." : deleteError ? "Tentar excluir novamente" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
