import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "macae-classificados";

// NavigationMenuItem is the <li> wrapper — it only reads as a control once it
// sits in a List with a Link or Trigger inside it.
export const InMenuBar = () => (
  <NavigationMenu className="w-full max-w-full justify-start">
    <NavigationMenuList className="justify-start gap-2">
      {["Imóveis", "Veículos", "Serviços"].map(name => (
        <NavigationMenuItem key={name}>
          <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
            {name}
          </NavigationMenuLink>
        </NavigationMenuItem>
      ))}
    </NavigationMenuList>
  </NavigationMenu>
);
