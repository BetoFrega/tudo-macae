import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { listUsers } from "@/features/users/actions/listUsers";
import { UserList } from "@/features/users/components/UserList";

export default async function AdminUsersPage() {
  const [{ users }, currentUser] = await Promise.all([
    listUsers(),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Usuários</h2>
      </div>

      <UserList users={users} currentUserUid={currentUser?.uid ?? ""} />

      {users.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          Nenhum usuário encontrado.
        </div>
      )}
    </div>
  );
}
