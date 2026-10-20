import { ArrowDown } from "lucide-react";
import type { IdentityLink } from "./rendering";

export function DiscoveryLayerNav({
  Link, scopeName }: { scopeName: string; Link: IdentityLink }) {
  const layers = [
    {
      href: "#negocios",
      label: "Negócios",
      accessibleLabel: "Ir para Negócios",
      description: "Negócios locais, contatos e áreas de atuação",
    },
    {
      href: "#anuncios",
      label: "Anúncios",
      accessibleLabel: "Ir para Anúncios",
      description: "Produtos, serviços e oportunidades publicados",
    },
  ];

  return (
    <nav
      aria-label={`Conteúdo de ${scopeName}`}
      className="mt-6 border-y border-foreground/20"
    >
      <ul className="grid grid-cols-2 divide-x divide-border">
        {layers.map(layer => (
          <li key={layer.href}>
            <Link
              href={layer.href}
              aria-label={layer.accessibleLabel}
              className="
                group flex min-h-14 items-center justify-between gap-2 px-2 py-3
                outline-none
                focus-visible:bg-muted
                sm:min-h-20 sm:gap-4 sm:px-5 sm:py-4
              "
            >
              <span>
                <span className="block font-semibold text-primary">
                  {layer.label}
                </span>
                <span className="
                  mt-0.5 hidden text-sm text-muted-foreground
                  sm:block
                "
                >
                  {layer.description}
                </span>
              </span>
              <ArrowDown
                aria-hidden="true"
                className="
                  size-4 shrink-0 text-primary transition-transform
                  group-hover:translate-y-0.5
                  motion-reduce:transition-none
                "
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
