"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdStatus } from "@tudomacae/ads/types";
import { formatSaoPauloDate } from "@tudomacae/civil-time";

type FilterOption = "all" | AdStatus;

interface AdminAd {
  id: string;
  title: string;
  slug: string;
  text: string;
  status: AdStatus;
  createdAt: number;
  categoryName: string;
  subcategoryName: string;
}

interface AdminAdListProps {
  ads: AdminAd[];
}

export function AdminAdList({ ads }: AdminAdListProps) {
  const [filter, setFilter] = useState<FilterOption>("all");

  const filteredAds = ads.filter((ad) => {
    if (filter === "all") return true;
    return ad.status === filter;
  });

  const activeCount = ads.filter(ad => ad.status === "active").length;
  const pausedCount = ads.filter(ad => ad.status === "paused").length;

  return (
    <div className="space-y-6">
      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar anúncios">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
        >
          Todos (
          {ads.length}
          )
        </Button>
        <Button
          variant={filter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("active")}
          aria-pressed={filter === "active"}
        >
          Ativos (
          {activeCount}
          )
        </Button>
        <Button
          variant={filter === "paused" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("paused")}
          aria-pressed={filter === "paused"}
        >
          Pausados (
          {pausedCount}
          )
        </Button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {filteredAds.length}
        {filteredAds.length === 1 ? " anúncio exibido" : " anúncios exibidos"}
      </p>

      {/* Ads table */}
      {filteredAds.length === 0
        ? (
            <div
              className={`
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Anúncio</TableHead>
                  <TableHead scope="col">Categoria</TableHead>
                  <TableHead scope="col">Subcategoria</TableHead>
                  <TableHead scope="col">Data de Criação</TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAds.map(ad => (
                  <TableRow key={ad.id}>
                    <TableCell className="max-w-xs">
                      <Link
                        href={`/anuncio/${ad.id}/${ad.slug}`}
                        className={`
                          line-clamp-2
                          hover:underline
                        `}
                      >
                        {ad.title}
                      </Link>
                    </TableCell>
                    <TableCell>{ad.categoryName}</TableCell>
                    <TableCell>{ad.subcategoryName}</TableCell>
                    <TableCell>
                      {formatSaoPauloDate(ad.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ad.status === "active" ? "default" : "outline"}
                        className={
                          ad.status === "active"
                            ? `
                              bg-primary
                              hover:bg-primary/90
                            `
                            : "text-muted-foreground"
                        }
                      >
                        {ad.status === "active" ? "Ativo" : "Pausado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
    </div>
  );
}
