import type { createAdAuthority } from "../authority";
export async function run(module: { createAdAuthority: typeof createAdAuthority }) {
  const authority = module.createAdAuthority({ id: "owner", admin: true, emailVerified: true });
  const profile = { userId: "owner", title: "Perfil", contacts: [{ number: "22999999999" }] };
  const ad = { userId: "owner", status: "active", revision: 1 };
  authority.canListForProfile(profile);
  authority.administrator();
  authority.owner("owner");
  authority.profile(profile, "owner");
  authority.authorize(ad, null);
  authority.completed(ad);
  authority.create(profile);
  authority.mutate(ad, undefined);
  authority.publish(ad, 1);
}
