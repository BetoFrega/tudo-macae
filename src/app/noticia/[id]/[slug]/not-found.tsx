import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className={`
          flex h-[calc(100vh-6rem)] flex-col items-center justify-center
        `}
        >
          <h1 className="mb-2 text-2xl font-bold">Matéria não encontrada</h1>
          <p className="mb-6 text-center text-muted-foreground">
            A matéria que você está procurando não existe ou saiu do ar.
          </p>
          <Button asChild className="min-h-11">
            <Link href="/">Ir para a página inicial</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
