import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "macae-classificados";

// SheetFooter pins its actions to the bottom of the SheetContent panel.
export const InSheet = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={e => e.preventDefault()}>
      <SheetHeader>
        <SheetTitle>Filtrar anúncios</SheetTitle>
      </SheetHeader>
      <SheetFooter>
        <Button>Aplicar filtros</Button>
        <SheetClose asChild>
          <Button variant="outline">Limpar</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
