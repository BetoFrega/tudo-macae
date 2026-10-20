import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AdPagination({ path, nextCursor, currentCursor }: {
  path: string;
  nextCursor?: string | undefined;
  currentCursor?: string | undefined;
}) {
  if (!nextCursor && !currentCursor) return null;
  return (
    <nav aria-label="Páginas de anúncios" className="mt-6 flex flex-wrap gap-4">
      {currentCursor && <Button asChild variant="outline"><Link href={`${path}#anuncios`}>Primeira página de anúncios</Link></Button>}
      {nextCursor && <Button asChild><Link href={`${path}?adCursor=${encodeURIComponent(nextCursor)}#anuncios`}>Mais anúncios</Link></Button>}
    </nav>
  );
}
