import { PasswordRecoveryPage } from "@/features/authentication/components/PasswordRecoveryPage";
export default function Page() {
  return (
    <main className="container mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Recuperar acesso</h1>
      <PasswordRecoveryPage />
    </main>
  );
}
