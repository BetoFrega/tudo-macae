import {
  missingPublishableProfileRequirements,
  type ProfileRequirement,
} from "./client";

export type { ProfileRequirement } from "./client";
export type PublicationRequirement = "email" | "profile";

export class PublicationRequirementError extends Error {
  constructor(
    readonly requirement: PublicationRequirement,
    readonly missing: ProfileRequirement[] = [],
  ) {
    super(requirement === "email"
      ? "Confirme seu e-mail antes de publicar ou reativar o anúncio."
      : profileRequirementMessage(missing));
    this.name = "PublicationRequirementError";
  }
}

export function profileRequirementMessage(missing: ProfileRequirement[]) {
  if (missing.length === 1 && missing[0] === "title") {
    return "Complete o nome do perfil antes de ativar o anúncio.";
  }
  if (missing.length === 1 && missing[0] === "contact") {
    return "Complete um contato válido no perfil antes de ativar o anúncio.";
  }
  return "Complete o nome e um contato válido no perfil antes de ativar o anúncio.";
}

export function assertPublishableProfile(profile: unknown) {
  const missing = missingPublishableProfileRequirements(profile);
  if (missing.length === 0) return;
  throw new PublicationRequirementError("profile", missing);
}

/** Keeping an active ad public is not a new publication or reactivation. */
export function assertEmailAllowsPublication(emailVerified: boolean, currentStatus: string | undefined, nextStatus: string | undefined) {
  if (nextStatus === "active" && currentStatus !== "active" && !emailVerified) {
    throw new PublicationRequirementError("email");
  }
}
