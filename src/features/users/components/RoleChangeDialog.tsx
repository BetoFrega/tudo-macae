import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRecord } from "@/features/users/use-cases/listUsersUseCase";
import { hasRole, ROLE_COPY, type RoleSelection } from "./userRoles";

function describeSelection(selected: RoleSelection | null, currentUserUid: string) {
  const copy = selected ? ROLE_COPY[selected.role] : null;
  const isGranted = selected ? hasRole(selected.user, selected.role) : false;
  // Only the admin role locks its owner out of this screen — see setRoleClaim.
  const blocksSelfRevoke
    = selected?.role === "admin"
      && selected.user.uid === currentUserUid
      && isGranted;
  return { copy, isGranted, blocksSelfRevoke };
}

interface RoleChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: RoleSelection | null;
  currentUserUid: string;
  error: string | null;
  isLoading: boolean;
  onConfirm: () => void;
}

export function RoleChangeDialog({
  open,
  onOpenChange,
  selected,
  currentUserUid,
  error,
  isLoading,
  onConfirm,
}: RoleChangeDialogProps) {
  const { copy, isGranted, blocksSelfRevoke } = describeSelection(selected, currentUserUid);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isGranted ? copy?.revokeTitle : copy?.grantTitle}
          </DialogTitle>
          <DialogDescription>
            <RoleChangeDescription
              copy={copy}
              isGranted={isGranted}
              blocksSelfRevoke={blocksSelfRevoke}
              email={selected?.user.email}
            />
          </DialogDescription>
        </DialogHeader>

        {error && <div className="text-sm text-destructive" role="alert">{error}</div>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          {!blocksSelfRevoke && (
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              variant={isGranted ? "destructive" : "default"}
            >
              {isLoading ? "Processando..." : "Confirmar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleChangeDescription({
  copy,
  isGranted,
  blocksSelfRevoke,
  email,
}: ReturnType<typeof describeSelection> & { email: UserRecord["email"] | undefined }) {
  if (blocksSelfRevoke) {
    return (
      <span className="text-destructive">
        Você não pode remover seu próprio status de admin.
      </span>
    );
  }
  return (
    <>
      Deseja
      {" "}
      {isGranted ? "remover" : "adicionar"}
      {" "}
      {copy?.subjectPhrase}
      {" "}
      para
      {" "}
      <strong>{email}</strong>
      ?
      {isGranted
        ? copy?.revokeDescription
        : copy?.grantDescription}
    </>
  );
}
