import { Button } from "@tudomacae/react-primitives/button";
import type { IdentityLink } from "./rendering";

export function BusinessClaimInvite({ href, Link }: { href: string; Link: IdentityLink }) {
  return (
    <section
      aria-labelledby="business-claim-invite-title"
      className="mt-4 max-w-prose rounded-lg border border-border p-4"
    >
      <h2 id="business-claim-invite-title" className="font-semibold">
        É o dono? Assuma esta página
      </h2>
      <p className="mt-1 text-sm/relaxed text-muted-foreground">
        Confirme que você responde por este negócio para atualizar as informações, ver quem procurou e publicar anúncios.
      </p>
      <Button asChild className="mt-3 min-h-11">
        <Link href={href}>Assumir esta página</Link>
      </Button>
    </section>
  );
}
