export type UserRoles = { isAdmin: boolean; isEditor: boolean };
export type SessionUser = UserRoles & { uid: string; email: string | undefined; emailVerified: boolean };
export type SessionResolution = { status: "missing" } | { status: "invalid" } | { status: "valid"; user: SessionUser };
