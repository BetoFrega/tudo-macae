"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EditAdButtonProps {
  adId: string;
}

export function EditAdButton({ adId }: EditAdButtonProps) {
  return (
    <Link href={`/anuncio/${adId}/editar`}>
      <Button variant="outline" size="sm" className="gap-2">
        <Pencil className="size-4" />
        Editar Anúncio
      </Button>
    </Link>
  );
}
