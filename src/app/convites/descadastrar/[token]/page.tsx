import type { Metadata } from "next";
import { unsubscribeFromBusinessInvitations } from "@/features/business-invitation/actions";

export const metadata: Metadata = {
  title: "Descadastrar convites | Tudo Macaé",
  robots: { index: false, follow: false },
};

/** Opening the link changes nothing: e-mail scanners follow links, so only the button unsubscribes. */
export default async function UnsubscribePage({ params }: PageProps<"/convites/descadastrar/[token]">) {
  const { token } = await params;
  return (
    <main className="
      container mx-auto max-w-2xl px-4 py-8
      sm:py-12
    "
    >
      <h1 className="text-3xl font-semibold tracking-tight">Parar de receber convites</h1>
      <p className="mt-4 text-muted-foreground">
        Enviamos um convite para o dono do negócio assumir a página no Tudo Macaé. Se você não quer receber outros convites neste endereço, confirme abaixo.
      </p>
      <form
        action={unsubscribeFromBusinessInvitations.bind(null, token)}
        className="mt-6"
      >
        <button
          type="submit"
          className="
            inline-flex min-h-11 items-center rounded-md bg-primary px-4
            font-medium text-primary-foreground
            hover:bg-primary/90
          "
        >
          Não quero mais receber convites
        </button>
      </form>
    </main>
  );
}
