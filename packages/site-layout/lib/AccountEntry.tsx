"use client";

import { Button } from "@tudomacae/react-primitives/button";
import { useSiteNavigation } from "./navigationIntegration";

type AccountEntryProps
  = | { onLogin: () => void; disabled?: boolean; href?: never }
    | { href: string; onLogin?: never; disabled?: never };

export function AccountEntry(props: AccountEntryProps) {
  const className = `
    min-h-11 px-2
    md:px-4
  `;
  if (props.href) {
    return <AccountLink href={props.href} className={className} />;
  }
  return (
    <Button variant="ghost" onClick={props.onLogin} disabled={props.disabled} className={className}>
      Entrar
    </Button>
  );
}

function AccountLink({ href, className }: { href: string; className: string }) {
  const { link: Link } = useSiteNavigation();
  return (
    <Button asChild variant="ghost" className={className}>
      <Link href={href}>Entrar</Link>
    </Button>
  );
}
