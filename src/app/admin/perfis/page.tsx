import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAllAdvertiserProfiles } from "@/features/advertiser-profile/actions/getAllAdvertiserProfiles";
import { AdminAdvertiserProfileList } from "@/features/advertiser-profile/components/AdminAdvertiserProfileList";

export default async function AdminProfilesPage() {
  const profiles = await getAllAdvertiserProfiles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Perfis de Anunciantes</h2>
        <Button asChild>
          <Link href="/admin/perfis/novo">Criar perfil reivindicável</Link>
        </Button>
      </div>

      <AdminAdvertiserProfileList profiles={profiles} />

      {profiles.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          Nenhum perfil de anunciante encontrado.
        </div>
      )}
    </div>
  );
}
