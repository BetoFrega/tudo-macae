import { Badge } from "@tudomacae/react-primitives/badge";

export function BusinessAdministrationStatus({
  isClaimable,
  badgeOnly = false,
}: {
  isClaimable: boolean;
  badgeOnly?: boolean;
}) {
  const label = isClaimable
    ? "Informações públicas"
    : "Administrado pelo negócio";

  return (
    <div className="space-y-2">
      <Badge variant="secondary">{label}</Badge>
      {!badgeOnly && (
        <p className="max-w-prose text-sm/relaxed text-muted-foreground">
          {isClaimable
            ? "Estas informações vêm de fontes públicas e ainda não são administradas pelo próprio negócio."
            : "As informações e os contatos desta página são mantidos pelo responsável pelo negócio."}
        </p>
      )}
    </div>
  );
}
