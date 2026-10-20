import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "macae-classificados";

// SheetHeader is the padded title slot at the top of a SheetContent panel.
export const InSheet = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={e => e.preventDefault()}>
      <SheetHeader>
        <SheetTitle>Filtrar anúncios</SheetTitle>
        <SheetDescription>
          Refine os resultados por categoria e situação.
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  </Sheet>
);
