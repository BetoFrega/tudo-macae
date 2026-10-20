"use client";

import { WhatsAppIcon } from "@tudomacae/react-primitives/whatsapp-icon";
import { useSiteNavigation } from "./navigationIntegration";
import { FacebookIcon, InstagramIcon } from "./SocialIcons";

const socialLinks = [
  { name: "Instagram", href: "https://instagram.com/tudomacae", icon: InstagramIcon },
  { name: "Facebook", href: "https://facebook.com/1350886791433451", icon: FacebookIcon },
  { name: "WhatsApp", href: "https://wa.me/552231880088", icon: WhatsAppIcon },
];

export function SiteFooter() {
  const { link: Link } = useSiteNavigation();
  return (
    <footer className="mt-auto w-full border-t border-border bg-white py-12">
      <div className="
        container mx-auto flex flex-col items-center justify-between gap-6 px-4
        text-sm text-muted-foreground
        lg:flex-row
      "
      >
        <div className="
          mb-2 flex flex-col items-center gap-4
          md:mb-0 md:flex-row
        "
        >
          <span>&copy; Tudo Macaé 2025</span>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/noticias"
              className="
                inline-flex min-h-11 items-center
                hover:text-foreground
              "
            >
              Blog
            </a>
            <a href="/termos-e-condicoes" className="hover:text-foreground">Termos e Condições</a>
            <Link
              href="/politica-de-privacidade"
              className="hover:text-foreground"
            >
              Política de Privacidade
            </Link>
          </div>
        </div>
        <div className="
          flex flex-col items-center gap-2
          lg:items-end
        "
        >
          <nav
            aria-label="Redes sociais do Tudo Macaé"
            className="flex flex-wrap justify-center gap-1"
          >
            {socialLinks.map(({ name, href, icon: Icon }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} (abre em nova aba)`}
                title={name}
                className="
                  inline-flex size-11 items-center justify-center rounded-md
                  text-primary
                  hover:bg-accent
                  focus-visible:outline-2 focus-visible:outline-offset-4
                  focus-visible:outline-primary
                "
              >
                <Icon aria-hidden="true" focusable="false" className="size-5" />
              </a>
            ))}
          </nav>
          <div>Feito com ♥ em Macaé</div>
        </div>
      </div>
    </footer>
  );
}
