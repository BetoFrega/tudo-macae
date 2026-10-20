"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteAd } from "../actions/deleteAd";

interface DeleteAdButtonProps {
  adId: string;
  onDialogOpenChange?: ((open: boolean) => void) | undefined;
}

export function DeleteAdButton({ adId, onDialogOpenChange }: DeleteAdButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    onDialogOpenChange?.(value);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAd(adId);
      handleOpenChange(false);
      router.push("/minha-conta/anuncios");
    }
    catch (error) {
      console.error("Error deleting ad:", error);
      alert("Erro ao excluir anúncio. Tente novamente.");
    }
    finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Trash2 className="size-4" />
          Excluir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir Anúncio</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir este anúncio? Esta ação não pode ser
            desfeita.
          </DialogDescription>
        </DialogHeader>
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
            {isDeleting ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
