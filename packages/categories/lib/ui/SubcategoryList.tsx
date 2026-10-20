"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useCategoryUI } from "./context";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@tudomacae/react-primitives/button";
import { Checkbox } from "@tudomacae/react-primitives/checkbox";
import { Input } from "@tudomacae/react-primitives/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tudomacae/react-primitives/table";
import type { Subcategory } from "../../model";
import { SubcategoryEditActionsCell, SubcategoryReadCells } from "./SubcategoryRowCells";

interface SubcategoryListProps {
  categoryId: string;
  categorySlug: string;
  subcategories: Subcategory[];
}

const subSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  order: z.number().finite(),
  businessOrder: z.number().finite().optional(),
  isActive: z.boolean(),
});

export function SubcategoryList({
  categoryId,
  categorySlug,
  subcategories,
}: SubcategoryListProps) {
  const { refresh, createSubcategory, updateSubcategory, deleteSubcategory } = useCategoryUI();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form for creating/editing
  const form = useForm<z.infer<typeof subSchema>>({
    resolver: zodResolver(subSchema),
    defaultValues: {
      name: "",
      slug: "",
      order: 0,
      isActive: true,
    },
  });

  const isActive = useWatch({ control: form.control, name: "isActive" });

  const startEditing = (sub: Subcategory) => {
    setEditingId(sub.id);
    setIsCreating(false);
    form.reset({
      name: sub.name,
      slug: sub.slug,
      order: sub.order,
      businessOrder: sub.businessOrder,
      isActive: sub.isActive,
    });
  };

  const startCreating = () => {
    setEditingId(null);
    setIsCreating(true);
    form.reset({
      name: "",
      slug: "",
      order: 0,
      isActive: true,
    });
  };

  const cancel = () => {
    setEditingId(null);
    setIsCreating(false);
    form.reset();
  };

  const save = async (values: z.infer<typeof subSchema>) => {
    try {
      if (isCreating) {
        const result = await createSubcategory({ categoryId, ...values });
        if (!result.success) throw new Error(result.error);
      }
      else if (editingId) {
        const result = await updateSubcategory({
          categoryId,
          subcategoryId: editingId,
          ...values,
        });
        if (!result.success) throw new Error(result.error);
      }
      refresh();
      cancel();
    }
    catch (error) {
      console.error(error);
      alert("Erro ao salvar subcategoria.");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta subcategoria?")) return;
    try {
      const result = await deleteSubcategory({ categoryId, subcategoryId: id });
      if (!result.success) throw new Error(result.error);
      refresh();
    }
    catch (error) {
      console.error(error);
      alert("Erro ao excluir subcategoria.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Subcategorias</h3>
        <Button
          onClick={startCreating}
          size="sm"
          disabled={isCreating || !!editingId}
        >
          <Plus className="mr-2 size-4" />
          {" "}
          Nova Subcategoria
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Ordem</TableHead>
              <TableHead>Ordem em Negócios</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Creating Row */}
            {isCreating && (
              <TableRow className="bg-muted/50">
                <TableCell>
                  <Input {...form.register("name")} placeholder="Nome" />
                </TableCell>
                <TableCell>
                  <Input {...form.register("slug")} placeholder="Slug" />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0"
                    {...form.register("order", { valueAsNumber: true })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    aria-label="Ordem em Negócios"
                    placeholder="Padrão"
                    {...form.register("businessOrder", {
                      setValueAs: value => value === "" ? undefined : Number(value),
                    })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={isActive}
                    onCheckedChange={c => form.setValue("isActive", !!c)}
                  />
                </TableCell>
                <SubcategoryEditActionsCell onSave={form.handleSubmit(save)} onCancel={cancel} />
              </TableRow>
            )}

            {subcategories.map(sub => (
              <TableRow key={sub.id}>
                {editingId === sub.id
                  ? (
                      <>
                        <TableCell>
                          <Input {...form.register("name")} />
                        </TableCell>
                        <TableCell>
                          <Input {...form.register("slug")} />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            {...form.register("order", { valueAsNumber: true })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            aria-label="Ordem em Negócios"
                            placeholder="Padrão"
                            {...form.register("businessOrder", {
                              setValueAs: value => value === "" ? undefined : Number(value),
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={isActive}
                            onCheckedChange={c => form.setValue("isActive", !!c)}
                          />
                        </TableCell>
                        <SubcategoryEditActionsCell onSave={form.handleSubmit(save)} onCancel={cancel} />
                      </>
                    )
                  : (
                      <SubcategoryReadCells
                        categoryId={categoryId}
                        categorySlug={categorySlug}
                        sub={sub}
                        actionsDisabled={isCreating || !!editingId}
                        onEdit={() => startEditing(sub)}
                        onRemove={() => remove(sub.id)}
                      />
                    )}
              </TableRow>
            ))}
            {!isCreating && subcategories.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Nenhuma subcategoria cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
