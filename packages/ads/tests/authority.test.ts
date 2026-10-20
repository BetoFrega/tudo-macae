import { expect, test } from "vitest";
import { createAdAuthority } from "../authority";
const ad = { userId: "owner", status: "active", revision: 1 };
const profile = { userId: "owner", title: "Meu perfil", contacts: [{ number: "22999998888" }] };
test("legacy active edits preserve eligibility until activation or reactivation", () => {
  const authority = createAdAuthority({ id: "owner", admin: false, emailVerified: false });
  expect(() => authority.mutate(ad, undefined)).not.toThrow();
  expect(() => authority.mutate(ad, "active")).not.toThrow();
  expect(() => authority.mutate({ ...ad, status: "paused" }, "active")).toThrow("Confirme seu e-mail");
});
test("fresh ad and profile ownership are required; admin is limited by the operation", () => {
  const authority = createAdAuthority({ id: "admin", admin: true, emailVerified: true });
  expect(() => authority.authorize({ ...ad, advertiserProfileId: "profile" }, profile)).not.toThrow();
  expect(() => authority.authorize(ad, null, false)).toThrow();
  expect(() => authority.administrator()).not.toThrow();
  expect(() => createAdAuthority({ id: "owner", admin: false, emailVerified: true }).administrator()).toThrow();
  expect(() => authority.authorize({ ...ad, deleting: true }, null)).toThrow();
  expect(() => authority.authorize({ ...ad, advertiserProfileId: "profile" }, null)).toThrow();
});
test("an associated ad follows the current identity owner instead of its historical UID", () => {
  const current = createAdAuthority({ id: "current-owner", admin: false, emailVerified: true });
  const former = createAdAuthority({ id: "former-owner", admin: false, emailVerified: true });
  const associated = { ...ad, advertiserProfileId: "profile" };
  expect(() => current.authorize(associated, { ...profile, userId: "current-owner" })).not.toThrow();
  expect(() => former.authorize(associated, { ...profile, userId: "current-owner" })).toThrow();
  expect(() => current.authorize(associated, null)).toThrow();
  expect(() => current.authorize(associated, { ...profile, userId: "current-owner", deleting: true })).toThrow();
});
test("creation checks account email and profile; publication requires the reviewed revision", () => {
  const authority = createAdAuthority({ id: "owner", admin: false, emailVerified: true });
  expect(() => authority.create(profile)).not.toThrow();
  expect(() => authority.create({ userId: "owner", title: "", contacts: [] })).toThrow();
  expect(() => authority.profile(profile, "intruder")).toThrow();
  expect(() => authority.publish({ ...ad, publicationState: "pending" }, 2)).toThrow();
  expect(() => authority.publish({ ...ad, publicationState: "published" }, undefined)).not.toThrow();
});

test("administrative profile reads are explicit and never bypass missing or deleting identities", () => {
  const admin = createAdAuthority({ id: "admin", admin: true, emailVerified: true });
  const identity = { userId: "holder", title: "Negócio" };
  expect(() => admin.profile(identity, "admin", true)).not.toThrow();
  expect(() => admin.profile(identity, "admin")).toThrow();
  expect(() => admin.profile({ ...identity, deleting: true }, "admin", true)).toThrow();
  expect(() => admin.profile(null, "admin", true)).toThrow();
  const holder = createAdAuthority({ id: "holder", admin: false, emailVerified: true });
  expect(() => holder.profile(identity, "holder", true)).not.toThrow();
  expect(() => holder.profile({ ...identity, userId: "another" }, "holder", true)).toThrow();
});
