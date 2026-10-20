export function assertProfileBelongsToAdOwner(
  adOwnerId: string,
  profileOwnerId: string | undefined,
) {
  if (profileOwnerId !== adOwnerId) {
    throw new Error("O perfil de anunciante deve pertencer ao proprietário do anúncio.");
  }
}
