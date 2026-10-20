import { Heart, PlusCircle, Search, Trash2 } from "lucide-react";
import { Button } from "macae-classificados";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Publicar anúncio</Button>
    <Button variant="secondary">Salvar rascunho</Button>
    <Button variant="outline">Ver detalhes</Button>
    <Button variant="ghost">Cancelar</Button>
    <Button variant="destructive">Excluir anúncio</Button>
    <Button variant="link">Saiba mais</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Pequeno</Button>
    <Button size="default">Padrão</Button>
    <Button size="lg">Grande</Button>
  </div>
);

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>
      <PlusCircle />
      Novo Anúncio
    </Button>
    <Button variant="outline">
      <Search />
      Buscar em Macaé
    </Button>
    <Button variant="destructive">
      <Trash2 />
      Remover
    </Button>
  </div>
);

export const IconOnly = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="icon-sm" aria-label="Favoritar">
      <Heart />
    </Button>
    <Button size="icon" variant="secondary" aria-label="Buscar">
      <Search />
    </Button>
    <Button size="icon-lg" variant="outline" aria-label="Excluir">
      <Trash2 />
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Publicar anúncio</Button>
    <Button variant="outline" disabled>Ver detalhes</Button>
    <Button variant="destructive" disabled>Excluir anúncio</Button>
  </div>
);
