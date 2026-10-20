import { hasPublishableProfile } from "@tudomacae/ads/client";

export function accountReminder(emailVerified: boolean, publications: { advertiserProfileId?: string | undefined }[], profiles: { id: string; title?: string; contacts?: unknown }[], publicationId?: string) {
  if (!emailVerified) return {
    text: "Confirme seu e-mail para publicar anúncios.", label: "Verificar e-mail",
    href: `/minha-conta/verificar-email${publicationId ? `?publication=${encodeURIComponent(publicationId)}` : ""}`,
  };
  if (!publications.length) return null;
  const blocked = publications.some(p => !hasPublishableProfile(profiles.find(profile => profile.id === p.advertiserProfileId)));
  return {
    text: blocked ? "Há anúncios aguardando você completar o perfil." : `${publications.length} ${publications.length === 1 ? "anúncio com publicação pendente." : "anúncios com publicação pendente."}`,
    label: "Ver anúncios", href: `/minha-conta/anuncios?filter=${blocked ? "profile" : "pending"}`,
  };
}
