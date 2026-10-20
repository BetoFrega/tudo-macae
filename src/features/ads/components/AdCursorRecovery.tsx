import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AdCursorRecovery({ path }: { path: string }) {
  return (
    <div className="space-y-4 rounded-xl border border-border p-6" role="status">
      <p>Esta página de anúncios é inválida. Volte à primeira página para continuar.</p>
      <Button asChild variant="outline"><Link href={`${path}#anuncios`}>Primeira página de anúncios</Link></Button>
    </div>
  );
}
