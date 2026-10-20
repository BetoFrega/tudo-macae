import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "macae-classificados";

// Mirrors src/features/navigation/CategoryNavigationMenu.tsx: a link-only item
// wears navigationMenuTriggerStyle() so it matches the height and padding of
// the items that do open a panel.
export const CategoryBar = () => (
  <NavigationMenu className="w-full max-w-full justify-start border-t pt-2">
    <NavigationMenuList className="flex-wrap justify-start gap-2">
      {["Imóveis", "Veículos", "Serviços", "Móveis", "Empregos"].map(name => (
        <NavigationMenuItem key={name}>
          <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
            {name}
          </NavigationMenuLink>
        </NavigationMenuItem>
      ))}
    </NavigationMenuList>
  </NavigationMenu>
);

// NavigationMenuContent renders inside the inline viewport (not a portal), so
// a controlled `value` on the root is enough to show the open panel.
export const WithOpenPanel = () => (
  <NavigationMenu value="imoveis" className="w-full max-w-full justify-start">
    <NavigationMenuList className="justify-start gap-2">
      <NavigationMenuItem value="imoveis">
        <NavigationMenuTrigger>Imóveis</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-[420px] gap-1 p-4">
            <li>
              <NavigationMenuLink
                href="#"
                className="rounded-md bg-muted p-4 no-underline"
              >
                <div className="mb-1 text-lg font-medium">Tudo em Imóveis</div>
                <p className="text-sm/tight text-muted-foreground">
                  Ver todos os anúncios desta categoria
                </p>
              </NavigationMenuLink>
            </li>
            <li>
              <NavigationMenuLink href="#" className="rounded-md p-3">
                <div className="text-sm leading-none font-medium">Aluguel</div>
                <p className="text-sm/snug text-muted-foreground">
                  Apartamentos, casas e temporada
                </p>
              </NavigationMenuLink>
            </li>
            <li>
              <NavigationMenuLink href="#" className="rounded-md p-3">
                <div className="text-sm leading-none font-medium">Venda</div>
                <p className="text-sm/snug text-muted-foreground">
                  Imóveis novos e usados em Macaé
                </p>
              </NavigationMenuLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem value="veiculos">
        <NavigationMenuTrigger>Veículos</NavigationMenuTrigger>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
          Serviços
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);
