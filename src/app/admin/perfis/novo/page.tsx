import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import AdminAdvertiserProfileForm from "@/features/advertiser-profile/components/AdminAdvertiserProfileForm";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";

export default async function AdminCreateClaimableProfilePage() {
  await connection();
  const categories = await getCategoriesLive();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Novo perfil reivindicável</h2>
        <Button variant="outline" asChild>
          <Link href="/admin/perfis">Voltar</Link>
        </Button>
      </div>
      <p className="max-w-2xl text-muted-foreground">
        Cadastre informações públicas de um negócio sem atribuir o perfil à sua conta administrativa. A foto pode ser adicionada depois, pela edição do perfil.
      </p>
      <AdminAdvertiserProfileForm
        mode="create-claimable"
        initialData={{ title: "", contacts: [], activityAreas: [] }}
        categories={categories}
      />
    </div>
  );
}
