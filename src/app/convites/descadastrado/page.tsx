import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Convites descadastrados | Tudo Macaé",
  robots: { index: false, follow: false },
};

const results = {
  ok: { title: "Pronto, você não vai mais receber convites", body: "Este endereço saiu da lista de convites do Tudo Macaé." },
  desconhecido: { title: "Não encontramos este convite", body: "O link pode estar incompleto. Se continuar recebendo convites, responda a qualquer um deles pedindo para sair." },
  indisponivel: { title: "Não foi possível descadastrar agora", body: "Tente novamente em alguns minutos." },
} as const;

export default async function UnsubscribedPage({ searchParams }: PageProps<"/convites/descadastrado">) {
  const { resultado, token } = await searchParams;
  const key = typeof resultado === "string" && resultado in results ? resultado as keyof typeof results : "desconhecido";
  const result = results[key];
  return (
    <main className="
      container mx-auto max-w-2xl px-4 py-8
      sm:py-12
    "
    >
      <h1 className="text-3xl font-semibold tracking-tight">{result.title}</h1>
      <p className="mt-4 text-muted-foreground">{result.body}</p>
      {key === "indisponivel" && typeof token === "string"
        ? (
            <Link
              href={`/convites/descadastrar/${encodeURIComponent(token)}`}
              className="
                mt-6 inline-flex min-h-11 items-center font-medium text-primary
                underline-offset-4
                hover:underline
              "
            >
              Tentar de novo
            </Link>
          )
        : (
            <Link
              href="/"
              className="
                mt-6 inline-flex min-h-11 items-center font-medium text-primary
                underline-offset-4
                hover:underline
              "
            >
              Ir para o Tudo Macaé
            </Link>
          )}
    </main>
  );
}
