import type { IdentityLink } from "./rendering";

/** One quiet line under the public-information notice; visitors read past it, owners find it. */
export function BusinessClaimInvite({ href, Link }: { href: string; Link: IdentityLink }) {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      É o dono deste negócio?
      {" "}
      <Link
        href={href}
        className="font-medium text-foreground underline underline-offset-4"
      >
        Assumir esta página
      </Link>
    </p>
  );
}
