"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductRoleClaimName } from "@tudomacae/authentication/claims";
import { formatSaoPauloDate } from "@tudomacae/civil-time";
import { setRoleClaim } from "@/features/users/actions/setRoleClaim";
import type { UserRecord } from "@/features/users/use-cases/listUsersUseCase";
import { RoleChangeDialog } from "./RoleChangeDialog";
import { hasRole, ROLE_COPY, ROLES, type RoleSelection } from "./userRoles";

interface UserListProps {
  users: UserRecord[];
  currentUserUid: string;
}

export function UserList({ users, currentUserUid }: UserListProps) {
  const [selected, setSelected] = useState<RoleSelection | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleBadgeClick = (user: UserRecord, role: ProductRoleClaimName) => {
    setSelected({ user, role });
    setError(null);
    setConfirmation(null);
    setIsDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (!selected) return;

    setIsLoading(true);
    setError(null);

    const result = await setRoleClaim(
      selected.user.uid,
      selected.role,
      !hasRole(selected.user, selected.role),
    );

    if (result.success) {
      const roleLabel = selected.role === "admin" ? "administrativo" : "editorial";
      setConfirmation(`Acesso ${roleLabel} atualizado para ${selected.user.email ?? "o usuário"}.`);
      setIsDialogOpen(false);
      setSelected(null);
    }
    else {
      setError(result.error ?? "Erro desconhecido");
    }

    setIsLoading(false);
  };

  return (
    <>
      {confirmation && (
        <p className="text-sm text-primary" role="status" aria-live="polite">
          {confirmation}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Email</TableHead>
            <TableHead scope="col">Nome</TableHead>
            <TableHead scope="col">Data de Criação</TableHead>
            <TableHead scope="col">Último Acesso</TableHead>
            {ROLES.map(role => (
              <TableHead key={role} scope="col">
                {ROLE_COPY[role].columnHeader}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(user => (
            <TableRow key={user.uid}>
              <TableCell>{user.email ?? "-"}</TableCell>
              <TableCell>{user.displayName ?? "-"}</TableCell>
              <TableCell>
                {user.createdAt
                  ? formatSaoPauloDate(Date.parse(user.createdAt))
                  : "-"}
              </TableCell>
              <TableCell>
                {user.lastSignIn
                  ? formatSaoPauloDate(Date.parse(user.lastSignIn))
                  : "-"}
              </TableCell>
              {ROLES.map((role) => {
                const roleCopy = ROLE_COPY[role];
                const granted = hasRole(user, role);
                return (
                  <TableCell key={role}>
                    <button
                      type="button"
                      onClick={() => handleBadgeClick(user, role)}
                      className="cursor-pointer"
                      aria-label={
                        granted
                          ? roleCopy.revokeLabel(user.email ?? "")
                          : roleCopy.grantLabel(user.email ?? "")
                      }
                    >
                      <Badge variant={granted ? "default" : "outline"}>
                        {granted ? roleCopy.grantedBadge : roleCopy.revokedBadge}
                      </Badge>
                    </button>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <RoleChangeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selected={selected}
        currentUserUid={currentUserUid}
        error={error}
        isLoading={isLoading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
