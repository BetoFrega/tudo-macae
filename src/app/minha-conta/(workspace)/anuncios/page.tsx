import { Loader2, PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import UserAdList from "@/features/ads/components/UserAdList";

export default async function MyAdsPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meus Anúncios</h1>
          <p className="mt-2 text-muted-foreground">
            Gerencie seus anúncios publicados
          </p>
        </div>
        <Button asChild>
          <Link href="/publicar">
            <PlusCircle className="mr-2 size-4" />
            Novo Anúncio
          </Link>
        </Button>
      </div>
      <Suspense
        fallback={(
          <div className="py-10 text-center" role="status" aria-live="polite">
            <div className="flex items-center justify-center">
              <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            </div>
            <p className="mt-2">Carregando seus anúncios...</p>
          </div>
        )}
      >
        <UserAdList />
      </Suspense>
    </main>
  );
}
