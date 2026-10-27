import Link from "next/link";
import { forbidden, unauthorized } from "next/navigation";
import { Suspense } from "react";
import { AreaNavigation } from "@/components/ui/area-navigation";
import { Loading } from "@/components/ui/loading";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";

const adminNavigationItems = [
  { href: "/admin/categorias", label: "Categorias" },
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/anuncios", label: "Anúncios" },
  { href: "/admin/perfis", label: "Perfis de Anunciantes" },
  { href: "/admin/midias", label: "Acervo de Mídia" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}

export async function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">
        <Link href="/admin">Painel Administrativo</Link>
      </h1>
      <div className={`
        flex flex-col gap-6
        md:flex-row md:gap-8
      `}
      >
        <aside className="
          w-full
          md:w-64 md:shrink-0
        "
        >
          <AreaNavigation items={adminNavigationItems} label="Navegação da Administração" />
        </aside>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
