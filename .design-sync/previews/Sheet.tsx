import {
  Button,
  Checkbox,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "macae-classificados";

// SheetContent portals to document.body and slides in from an edge, so these
// render open (cardMode "single" in cfg.overrides).
export const Filters = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={e => e.preventDefault()}>
      <SheetHeader>
        <SheetTitle>Filtrar anúncios</SheetTitle>
        <SheetDescription>
          Refine os resultados por categoria e situação.
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-3 px-4">
        <div className="flex items-center gap-2">
          <Checkbox id="sf1" defaultChecked />
          <Label htmlFor="sf1">Imóveis</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="sf2" />
          <Label htmlFor="sf2">Veículos</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="sf3" />
          <Label htmlFor="sf3">Serviços</Label>
        </div>
      </div>
      <SheetFooter>
        <Button>Aplicar filtros</Button>
        <SheetClose asChild>
          <Button variant="outline">Limpar</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

export const MobileMenu = () => (
  <Sheet open>
    <SheetContent side="left" onOpenAutoFocus={e => e.preventDefault()}>
      <SheetHeader>
        <SheetTitle>Tudo Macaé</SheetTitle>
      </SheetHeader>
      <nav className="grid gap-1 px-4 text-sm">
        <a
          className="
            rounded-md p-2
            hover:bg-accent
          "
          href="#"
        >
          Início
        </a>
        <a
          className="
            rounded-md p-2
            hover:bg-accent
          "
          href="#"
        >
          Imóveis
        </a>
        <a
          className="
            rounded-md p-2
            hover:bg-accent
          "
          href="#"
        >
          Veículos
        </a>
        <a
          className="
            rounded-md p-2
            hover:bg-accent
          "
          href="#"
        >
          Serviços
        </a>
        <a
          className="
            rounded-md p-2
            hover:bg-accent
          "
          href="#"
        >
          Minha conta
        </a>
      </nav>
    </SheetContent>
  </Sheet>
);
