import Link from "next/link";
import { forbidden, unauthorized } from "next/navigation";
import { Suspense } from "react";
import { AreaNavigation } from "@/components/ui/area-navigation";
import { Loading } from "@/components/ui/loading";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";

const newsroomNavigationItems = [
  { href: "/redacao/materias", label: "Posts" },
  { href: "/redacao/acervo", label: "Acervo de mídia" },
];

export default function NewsroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <NewsroomLayoutContent>{children}</NewsroomLayoutContent>
    </Suspense>
  );
}

export async function NewsroomLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin && !user.isEditor) return forbidden();

  return (
    <div className="
      container mx-auto px-4 py-8
      md:px-6
    "
    >
      <h1 className="mb-8 text-3xl font-bold">
        <Link href="/redacao">Blog</Link>
      </h1>
      <div className="
        flex flex-col gap-6
        md:flex-row md:gap-8
      "
      >
        <aside className="
          w-full
          md:w-64 md:shrink-0
        "
        >
          <AreaNavigation items={newsroomNavigationItems} label="Navegação do blog" />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
