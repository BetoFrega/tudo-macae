import { Eye, LoaderCircle, Pencil, Plus, User, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { getUserAdvertiserProfiles } from "@/features/advertiser-profile/actions/getUserAdvertiserProfiles";
import { assessBusinessesUseCase } from "@/packages/classifieds-api";
import { businessCanonicalPath, businessMissingRequirements } from "@tudomacae/advertiser-identity/businessPresentation";

export default async function AdvertiserProfilesPage() {
  return (
    <main className="
      container mx-auto max-w-6xl px-4 py-8
      sm:px-6 sm:py-10
    "
    >
      <div className="
        mb-8 flex flex-col gap-6 border-b pb-6
        sm:flex-row sm:items-center sm:justify-between
      "
      >
        <h1 className="
          min-w-0 text-2xl/tight font-bold tracking-tight text-balance
          sm:text-3xl
        "
        >
          Meus Perfis de Anunciante
        </h1>
        <Button
          asChild
          className="
            h-auto min-h-11 w-full py-2 whitespace-normal
            sm:w-auto
          "
        >
          <Link href="/minha-conta/perfis/novo">
            <Plus aria-hidden="true" />
            Criar Novo Perfil
          </Link>
        </Button>
      </div>
      <Suspense fallback={(
        <div
          role="status"
          className="
            flex min-h-48 items-center justify-center gap-3 text-sm
            text-muted-foreground
          "
        >
          <LoaderCircle
            aria-hidden="true"
            className="
              size-5
              motion-safe:animate-spin
            "
          />
          Carregando...
        </div>
      )}
      >
        <UserProfiles />
      </Suspense>
    </main>
  );
}

const UserProfiles = async () => {
  const profiles = await getUserAdvertiserProfiles();
  const readiness = await assessBusinessesUseCase(profiles);
  return (
    <div className={`
      grid items-stretch gap-6
      md:grid-cols-2
      lg:grid-cols-3
    `}
    >
      {profiles.map((profile, index) => (
        <ProfileCard
          key={profile.id}
          profile={profile}
          business={readiness[index]?.business}
          missing={readiness[index]?.missing ?? []}
        />
      ))}
      {profiles.length === 0 && (
        <div className="
          col-span-full flex min-h-60 flex-col items-center justify-center gap-4
          rounded-xl border border-dashed px-6 py-10 text-center
        "
        >
          <Users aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="max-w-sm leading-relaxed text-muted-foreground">
            Você ainda não tem nenhum perfil de anunciante.
          </p>
        </div>
      )}
    </div>
  );
};

type AdvertiserProfile = Awaited<ReturnType<typeof getUserAdvertiserProfiles>>[number];
type BusinessReadiness = Awaited<ReturnType<typeof assessBusinessesUseCase>>[number];
type CatalogBusiness = NonNullable<BusinessReadiness["business"]>;

function ProfileCard({ profile, business, missing }: {
  profile: AdvertiserProfile;
  business: BusinessReadiness["business"] | undefined;
  missing: Parameters<typeof businessMissingRequirements>[0];
}) {
  const title = profile.title || "Perfil Padrão";
  return (
    <Card
      role="article"
      aria-label={title}
      className="min-w-0 gap-4"
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <Avatar className="size-12 shrink-0">
            <AvatarImage src={profile.photoURL} alt={profile.title} />
            <AvatarFallback>
              <User aria-hidden="true" className="size-6" />
            </AvatarFallback>
          </Avatar>
          <h2 className="
            min-w-0 self-center text-lg/snug font-semibold wrap-anywhere
          "
          >
            {title}
          </h2>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <CatalogVisibility visible={Boolean(business)} missing={missing} />
        <p className="
          text-sm/relaxed wrap-anywhere whitespace-pre-line
          text-muted-foreground
        "
        >
          {profile.description || "Sem descrição"}
        </p>
      </CardContent>
      <CardFooter className="mx-6 flex-col gap-2 border-t px-0 pt-4">
        {business && <BusinessLink business={business} title={title} />}
        <EditProfileLink profileId={profile.id} title={title} listed={Boolean(business)} />
      </CardFooter>
    </Card>
  );
}

function CatalogVisibility({ visible, missing }: {
  visible: boolean;
  missing: Parameters<typeof businessMissingRequirements>[0];
}) {
  if (visible) {
    return (
      <p className="flex items-center gap-2 text-sm text-primary">
        <Eye aria-hidden="true" className="size-4 shrink-0" />
        Visível no catálogo
      </p>
    );
  }
  return (
    <p className="
      rounded-md bg-muted px-3 py-2 text-sm/relaxed wrap-anywhere
      text-foreground
    "
    >
      Para aparecer no catálogo, falta:
      {" "}
      {businessMissingRequirements(missing)}
      .
    </p>
  );
}

function BusinessLink({ business, title }: { business: CatalogBusiness; title: string }) {
  return (
    <Button
      variant="outline"
      asChild
      className="h-auto min-h-11 w-full py-2 whitespace-normal"
    >
      <Link
        href={businessCanonicalPath(business)}
        aria-label={`Ver negócio: ${title}`}
      >
        Ver negócio
      </Link>
    </Button>
  );
}

function EditProfileLink({ profileId, title, listed }: {
  profileId: string;
  title: string;
  listed: boolean;
}) {
  const action = listed ? "Editar" : "Completar cadastro";
  return (
    <Button
      variant={listed ? "ghost" : "default"}
      asChild
      className="h-auto min-h-11 w-full py-2 whitespace-normal"
    >
      <Link
        href={`/minha-conta/perfis/${profileId}/editar`}
        aria-label={`${action}: ${title}`}
      >
        <Pencil aria-hidden="true" />
        {action}
      </Link>
    </Button>
  );
}
