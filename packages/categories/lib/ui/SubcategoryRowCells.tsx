"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useCategoryUI } from "./context";
import { Button } from "@tudomacae/react-primitives/button";
import { Checkbox } from "@tudomacae/react-primitives/checkbox";
import { TableCell } from "@tudomacae/react-primitives/table";
import type { Subcategory } from "../../model";

interface SubcategoryEditActionsCellProps {
  onSave: () => void;
  onCancel: () => void;
}

export function SubcategoryEditActionsCell({ onSave, onCancel }: SubcategoryEditActionsCellProps) {
  return (
    <TableCell>
      <div className="flex gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={onSave}
          aria-label="Salvar"
        >
          <Check className="size-4 text-primary" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCancel}
          aria-label="Cancelar"
        >
          <X className="size-4 text-destructive" />
        </Button>
      </div>
    </TableCell>
  );
}

interface SubcategoryReadCellsProps {
  categoryId: string;
  categorySlug: string;
  sub: Subcategory;
  actionsDisabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

export function SubcategoryReadCells({
  categoryId,
  categorySlug,
  sub,
  actionsDisabled,
  onEdit,
  onRemove,
}: SubcategoryReadCellsProps) {
  const { Link } = useCategoryUI();
  return (
    <>
      <TableCell>
        <Link
          href={`/categoria/${categoryId}/${categorySlug}/${sub.id}/${sub.slug}`}
          className={`
            text-primary
            hover:underline
          `}
          title="Ver página da subcategoria"
        >
          {sub.name}
        </Link>
      </TableCell>
      <TableCell>{sub.slug}</TableCell>
      <TableCell>{sub.order}</TableCell>
      <TableCell>{sub.businessOrder ?? "Padrão"}</TableCell>
      <TableCell>
        <Checkbox checked={sub.isActive} disabled />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            disabled={actionsDisabled}
            aria-label="Editar"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            disabled={actionsDisabled}
            aria-label="Excluir"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </>
  );
}
