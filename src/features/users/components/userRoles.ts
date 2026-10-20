import type { ProductRoleClaimName } from "@tudomacae/authentication/claims";
import type { UserRecord } from "@/features/users/use-cases/listUsersUseCase";

/**
 * Everything each role says on this screen, so the two columns differ in
 * wording alone. The badges never share a label: the e2e specs pick a row's
 * state out of its text, and two columns both reading "Usuário" would make
 * that ambiguous.
 */
export const ROLE_COPY: Record<
  ProductRoleClaimName,
  {
    columnHeader: string;
    grantedBadge: string;
    revokedBadge: string;
    grantLabel: (email: string) => string;
    revokeLabel: (email: string) => string;
    grantTitle: string;
    revokeTitle: string;
    subjectPhrase: string;
    grantDescription: string;
    revokeDescription: string;
  }
> = {
  admin: {
    columnHeader: "Admin",
    grantedBadge: "Admin",
    revokedBadge: "Usuário",
    grantLabel: email => `Tornar ${email} admin`,
    revokeLabel: email => `Remover admin de ${email}`,
    grantTitle: "Adicionar Admin",
    revokeTitle: "Remover Admin",
    subjectPhrase: "o status de admin",
    grantDescription:
      "Isso irá conceder privilégios de administrador a este usuário.",
    revokeDescription:
      "Isso irá remover os privilégios de administrador deste usuário.",
  },
  editor: {
    columnHeader: "Editor",
    grantedBadge: "Editor",
    revokedBadge: "Leitor",
    grantLabel: email => `Tornar ${email} editor`,
    revokeLabel: email => `Remover editor de ${email}`,
    grantTitle: "Adicionar Editor",
    revokeTitle: "Remover Editor",
    subjectPhrase: "o papel de editor",
    grantDescription:
      "Isso irá permitir que este usuário acesse a redação. O papel vale a partir do próximo login dele.",
    revokeDescription:
      "Isso irá remover o acesso deste usuário à redação a partir do próximo login dele.",
  },
};

/** Column order, left to right. */
export const ROLES: ProductRoleClaimName[] = ["admin", "editor"];

export const hasRole = (user: UserRecord, role: ProductRoleClaimName) =>
  role === "admin" ? user.isAdmin : user.isEditor;

export interface RoleSelection {
  user: UserRecord;
  role: ProductRoleClaimName;
}
