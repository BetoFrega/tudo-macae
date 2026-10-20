import { MoreHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "macae-classificados";

// DropdownMenuContent portals to document.body, so the open state only renders
// in a single-story card (cardMode "single" in cfg.overrides).
export const AdActions = () => (
  <DropdownMenu open modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="icon" aria-label="Ações do anúncio">
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Anúncio</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem>
          Editar
          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Renovar por 30 dias</DropdownMenuItem>
        <DropdownMenuItem>Compartilhar</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive">Excluir anúncio</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const AccountMenu = () => (
  <DropdownMenu open modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost">Minha conta</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-52">
      <DropdownMenuLabel>Marina Souza</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Meus anúncios</DropdownMenuItem>
      <DropdownMenuItem>Perfis</DropdownMenuItem>
      <DropdownMenuItem>Configurações</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Sair</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
