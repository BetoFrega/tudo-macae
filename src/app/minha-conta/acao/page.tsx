import Link from "next/link";

import { EmailVerificationAction } from "@/features/authentication/components/EmailVerificationAction";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { ResetPasswordForm } from "@tudomacae/authentication/ui";

export default async function AccountActionsPage({
  searchParams,
}: PageProps<"/minha-conta/acao">) {
  return (
    <main className="container mx-auto px-4 py-8">
      <Suspense fallback={<Loading />}>
        <AsyncContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type AccountActionParameter = string | string[] | undefined;

const continuationIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

function continuationId(target: URL, name: string): string | undefined {
  const id = target.searchParams.get(name);
  return id && continuationIdPattern.test(id) ? id : undefined;
}

function continuationTargets(continueUrl: AccountActionParameter) {
  let target: URL;
  try {
    target = new URL(typeof continueUrl === "string" ? continueUrl : "");
  }
  catch {
    /* No continuation is required to confirm an address. */
    return {};
  }
  const publication = continuationId(target, "publication");
  const ad = continuationId(target, "ad");
  return {
    ...(publication ? { publication } : {}),
    ...(ad ? { ad } : {}),
  };
}

function isEmailVerificationMode(mode: AccountActionParameter): boolean {
  return mode === "verifyEmail" || mode === "verifyAndChangeEmail";
}

function RetiredActionLink({ mode }: { mode: AccountActionParameter }) {
  return (
    <div role="status">
      Este link anterior à mudança de acesso não funciona mais.
      {mode === "resetPassword"
        ? (
            <Link href="/minha-conta/recuperar-senha">
              Solicitar um novo link de recuperação
            </Link>
          )
        : (
            <Link href="/minha-conta/verificar-email">
              Entrar e solicitar uma nova verificação
            </Link>
          )}
    </div>
  );
}

const AsyncContent = async ({
  searchParams,
}: {
  searchParams: PageProps<"/minha-conta/acao">["searchParams"];
}) => {
  const { mode, token: code, continueUrl } = await searchParams;
  if (typeof code !== "string")
    return <RetiredActionLink mode={mode} />;
  if (isEmailVerificationMode(mode)) {
    return (
      <EmailVerificationAction
        code={code}
        {...continuationTargets(continueUrl)}
      />
    );
  }

  if (mode === "resetPassword" && code) {
    return <ResetPasswordForm oobCode={code} />;
  }

  return <div role="alert">Operação inválida ou código ausente.</div>;
};
