"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@tudomacae/react-primitives/button";
import { FormLabel } from "@tudomacae/react-primitives/form";
import type { ActivityArea } from "../../model";

export interface ActivityAreaCategory {
  id: string;
  name: string;
  isActive: boolean;
  subcategories: { id: string; name: string; isActive: boolean }[];
}

export function hasUnavailableActivityAreas(
  areas: ActivityArea[],
  categories: ActivityAreaCategory[],
): boolean {
  return areas.some((area) => {
    const category = categories.find(item => item.id === area.categoryId);
    const subcategory = category?.subcategories.find(
      item => item.id === area.subcategoryId,
    );
    return !category?.isActive || subcategory?.isActive !== true;
  });
}

function activeSubcategories(categories: ActivityAreaCategory[], categoryId: string) {
  const category = categories.find(item => item.id === categoryId);
  return category?.subcategories.filter(item => item.isActive) ?? [];
}

function canAddSelection({ categoryId, subcategoryId, isDuplicate, count }: {
  categoryId: string;
  subcategoryId: string;
  isDuplicate: boolean;
  count: number;
}) {
  return Boolean(categoryId) && Boolean(subcategoryId) && count !== 3 && !isDuplicate;
}

export function ActivityAreaSelector({
  categories,
  value,
  onChange,
  onPendingSelectionChange,
  pendingSelectionError,
}: {
  categories: ActivityAreaCategory[];
  value: ActivityArea[];
  onChange(value: ActivityArea[]): void;
  onPendingSelectionChange?(pending: boolean): void;
  pendingSelectionError?: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const subcategories = activeSubcategories(categories, categoryId);
  const hasUnavailable = hasUnavailableActivityAreas(value, categories);
  const isDuplicate = value.some(item => item.categoryId === categoryId && item.subcategoryId === subcategoryId);
  const canAdd = canAddSelection({ categoryId, subcategoryId, isDuplicate, count: value.length });
  const add = () => {
    if (!canAdd) return;
    onChange([...value, { categoryId, subcategoryId }]);
    setSubcategoryId("");
    onPendingSelectionChange?.(false);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FormLabel>Áreas de atuação</FormLabel>
        <span className="text-sm text-muted-foreground">
          {value.length}
          {" "}
          de 3
        </span>
      </div>
      {value.map((area, index) => {
        const selectedCategory = categories.find(
          item => item.id === area.categoryId,
        );
        const selectedSubcategory = selectedCategory?.subcategories.find(
          item => item.id === area.subcategoryId,
        );
        const label
          = selectedCategory?.isActive && selectedSubcategory?.isActive
            ? `${selectedCategory.name} → ${selectedSubcategory.name}`
            : "Área de atuação indisponível";
        return (
          <div
            key={`${area.categoryId}-${area.subcategoryId}`}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <span>{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Remover área de atuação"
              onClick={() => {
                const remaining = value.filter((_, itemIndex) => itemIndex !== index);
                onChange(remaining);
                onPendingSelectionChange?.(Boolean(subcategoryId) && !remaining.some(item => item.categoryId === categoryId && item.subcategoryId === subcategoryId));
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        );
      })}
      {hasUnavailable && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Remova ou substitua as áreas indisponíveis antes de salvar.
        </p>
      )}
      <div className="
        grid gap-2
        sm:grid-cols-3
      "
      >
        <select
          aria-label="Categoria da área de atuação"
          className="h-10 rounded-md border bg-background px-3"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setSubcategoryId("");
            onPendingSelectionChange?.(false);
          }}
          disabled={value.length === 3}
        >
          <option value="">Categoria</option>
          {categories
            .filter(item => item.isActive)
            .map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Subcategoria da área de atuação"
          aria-describedby={isDuplicate ? "activity-area-duplicate-error" : undefined}
          aria-invalid={isDuplicate}
          className="h-10 rounded-md border bg-background px-3"
          value={subcategoryId}
          onChange={(event) => {
            setSubcategoryId(event.target.value);
            onPendingSelectionChange?.(Boolean(event.target.value) && !value.some(item => item.categoryId === categoryId && item.subcategoryId === event.target.value));
          }}
          disabled={!categoryId || value.length === 3}
        >
          <option value="">Subcategoria</option>
          {subcategories.map(item => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button
          id="activity-area-add"
          aria-describedby={pendingSelectionError ? "activity-area-pending-error" : undefined}
          type="button"
          variant="outline"
          onClick={add}
          disabled={!canAdd}
        >
          Adicionar área
        </Button>
      </div>
      {isDuplicate && (
        <p
          id="activity-area-duplicate-error"
          role="alert"
          className="text-sm text-destructive"
        >
          Esta área já foi adicionada. Escolha outra subcategoria.
        </p>
      )}
      {pendingSelectionError && (
        <p
          id="activity-area-pending-error"
          role="alert"
          className="text-sm text-destructive"
        >
          Clique em Adicionar área para incluir a seleção antes de salvar.
        </p>
      )}
    </div>
  );
}
