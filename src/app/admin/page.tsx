import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className={`
        grid grid-cols-1 gap-6
        md:grid-cols-2
        lg:grid-cols-3
      `}
      >
        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
            <CardDescription>
              Gerencie as categorias e subcategorias do sistema.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/admin/categorias">Gerenciar Categorias</Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>
              Visualize todos os usuários cadastrados no sistema.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/admin/usuarios">Ver Usuários</Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Anúncios</CardTitle>
            <CardDescription>
              Visualize todos os anúncios da plataforma, incluindo pausados.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/admin/anuncios">Ver Anúncios</Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Perfis de Anunciantes</CardTitle>
            <CardDescription>
              Visualize e edite todos os perfis de anunciantes do sistema.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/admin/perfis">Ver Perfis</Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Acervo de Mídia</CardTitle>
            <CardDescription>
              Cadastre mídias e edite as que já estão no acervo.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/admin/midias">Ver Acervo</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
