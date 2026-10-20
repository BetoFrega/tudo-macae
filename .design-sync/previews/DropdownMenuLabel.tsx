import { MoreHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "macae-classificados";

// DropdownMenuLabel is the non-interactive section heading inside a menu.
// The trigger has to be here: without an anchor element the popper has nothing
// to measure against and the content collapses.
export const InMenu = () => (
  <DropdownMenu open modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="icon" aria-label="Ações do anúncio">
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Anúncio</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Editar</DropdownMenuItem>
      <DropdownMenuItem>Renovar por 30 dias</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
