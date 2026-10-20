import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdStatus } from "@tudomacae/ads/types";

export function UserAdStatusBadge({ status }: { status: AdStatus }) {
  const active = status === "active";
  return (
    <Badge
      variant={active ? "default" : "outline"}
      className={
        active
          ? `
            bg-primary
            hover:bg-primary/90
          `
          : "text-muted-foreground"
      }
    >
      {active ? "Ativo" : "Pausado"}
    </Badge>
  );
}

export function UserAdStatusConfirmation({ message, href }: { message: string; href: string }) {
  return (
    <div
      role="status"
      className="
        mt-4 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4
        text-sm
      "
    >
      <p className="font-medium text-primary">{message}</p>
      {message === "Anúncio ativo." && (
        <Button asChild size="sm" variant="outline">
          <Link href={href}>Ver anúncio</Link>
        </Button>
      )}
    </div>
  );
}
