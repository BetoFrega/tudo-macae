"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { PendingAdPublication } from "@tudomacae/ads/client";
import { deletePendingPublication } from "../actions/publication";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notifyAccountReminderChanged } from "@/features/authentication/accountReminderEvents";
import type { AdImage, AdStatus } from "@tudomacae/ads/types";
import { UserAdCard } from "./UserAdCard";

type FilterOption = "all" | AdStatus | "pending" | "profile";

function filterFromUrl(value: string | null): FilterOption {
  return value === "active" || value === "paused" || value === "pending" || value === "profile" ? value : "all";
}

interface AdWithCategories {
  id: string;
  categoryId: string;
  subcategoryId: string;
  advertiserProfileId: string;
  title: string;
  slug: string;
  text: string;
  userId: string;
  status: AdStatus;
  createdAt: number;
  updatedAt?: number;
  categoryName: string;
  subcategoryName: string;
  images?: (AdImage & { url: string })[];
}

interface UserAdListClientProps {
  ads: AdWithCategories[];
  publications?: (PendingAdPublication & { profilePending: boolean })[];
}

function FilterButton({ value, current, onSelect, children }: { value: FilterOption; current: FilterOption; onSelect: (value: FilterOption) => void; children: React.ReactNode }) {
  return (
    <Button
      variant={current === value ? "default" : "outline"}
      size="sm"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children}
    </Button>
  );
}

export function UserAdListClient({ ads, publications = [] }: UserAdListClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedFilter = filterFromUrl(searchParams.get("filter"));
  const [selection, setSelection] = useState({ requested: requestedFilter, selected: requestedFilter });
  if (selection.requested !== requestedFilter) {
    setSelection({ requested: requestedFilter, selected: requestedFilter });
  }
  const filter = selection.requested === requestedFilter ? selection.selected : requestedFilter;
  const selectFilter = (value: FilterOption) => {
    setSelection({ requested: requestedFilter, selected: value });
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete("filter");
    else next.set("filter", value);
    const query = next.toString();
    router.replace(`/minha-conta/anuncios${query ? `?${query}` : ""}`, { scroll: false });
  };

  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const pending = publications.filter(item => filter === "all" || filter === "pending" || (filter === "profile" && item.profilePending));

  const availableAds = ads.filter(ad => !publications.some(item => item.id === ad.id));
  const filteredAds = availableAds.filter((ad) => {
    if (filter === "all") return true;
    return ad.status === filter;
  });

  const activeCount = availableAds.filter(ad => ad.status === "active").length;
  const pausedCount = availableAds.filter(ad => ad.status === "paused").length;

  return (
    <div className="space-y-6">
      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar meus anúncios">
        <FilterButton value="all" current={filter} onSelect={selectFilter}>
          Todos (
          {availableAds.length + publications.length}
          )
        </FilterButton>
        <FilterButton value="active" current={filter} onSelect={selectFilter}>
          Ativos (
          {activeCount}
          )
        </FilterButton>
        <FilterButton value="paused" current={filter} onSelect={selectFilter}>
          Pausados (
          {pausedCount}
          )
        </FilterButton>
        <FilterButton value="pending" current={filter} onSelect={selectFilter}>
          Publicação pendente (
          {publications.length}
          )
        </FilterButton>
        <FilterButton value="profile" current={filter} onSelect={selectFilter}>
          Perfil pendente (
          {publications.filter(item => item.profilePending).length}
          )
        </FilterButton>
      </div>

      {error && <p role="alert">{error}</p>}
      {pending.map(item => (
        <section key={item.id} className="space-y-3 rounded-lg border p-5">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p>{item.deleting ? "A exclusão das fotos não foi concluída. Tente novamente." : item.profilePending ? "Complete o perfil para publicar seu anúncio." : "Seu anúncio está salvo. Conclua a publicação."}</p>
          <div className="flex flex-wrap gap-3">
            {!item.deleting && <Button asChild><Link href={`/publicar?publication=${item.id}`}>Concluir publicação</Link></Button>}
            <Button
              variant="outline"
              disabled={deleting === item.id}
              onClick={async () => {
                if (!window.confirm("Excluir esta publicação pendente?")) return;
                setError("");
                setDeleting(item.id);
                try {
                  const result = await deletePendingPublication(item.id);
                  if (!result.success) {
                    setError(result.error || "Não foi possível excluir a publicação. Tente novamente.");
                    notifyAccountReminderChanged();
                    router.refresh();
                    return;
                  }
                  notifyAccountReminderChanged();
                  router.refresh();
                }
                catch {
                  setError("Não foi possível excluir a publicação. Tente novamente.");
                  notifyAccountReminderChanged();
                  router.refresh();
                }
                finally {
                  setDeleting(null);
                }
              }}
            >
              {item.deleting ? "Tentar excluir novamente" : "Excluir"}
            </Button>
          </div>
        </section>
      ))}
      {/* Ads grid */}
      {filteredAds.length === 0 && pending.length === 0
        ? (
            <div className={`
              rounded-lg border border-dashed bg-muted/30 py-10 text-center
            `}
            >
              <p className="text-muted-foreground">
                Nenhum anúncio
                {" "}
                {filter === "active"
                  ? "ativo"
                  : filter === "paused"
                    ? "pausado"
                    : ""}
                {" "}
                encontrado.
              </p>
            </div>
          )
        : (
            <div className={`
              grid gap-6
              md:grid-cols-2
              lg:grid-cols-3
            `}
            >
              {filteredAds.map(ad => (
                <UserAdCard
                  key={ad.id}
                  id={ad.id}
                  title={ad.title}
                  slug={ad.slug}
                  category={ad.categoryName}
                  subcategory={ad.subcategoryName}
                  text={ad.text}
                  status={ad.status}
                  createdAt={ad.createdAt}
                  imageUrl={ad.images?.[0]?.url}
                />
              ))}
            </div>
          )}
    </div>
  );
}
