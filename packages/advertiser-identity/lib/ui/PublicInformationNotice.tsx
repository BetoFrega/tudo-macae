import { Badge } from "@tudomacae/react-primitives/badge";

export function PublicInformationNotice({
  compact = false,
  badgeOnly = false,
}: {
  compact?: boolean;
  badgeOnly?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1.5" : "mt-3 space-y-2"}>
      <Badge variant="secondary">Informações públicas</Badge>
      {!badgeOnly && (
        <p className="max-w-prose text-sm/relaxed text-muted-foreground">
          Estas informações vêm de fontes públicas. No momento, esta página não é administrada pelo próprio negócio.
        </p>
      )}
    </div>
  );
}
