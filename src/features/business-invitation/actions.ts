"use server";

import { redirect } from "next/navigation";
import { businessInvitations } from "@/packages/classifieds-api/businessInvitations";

/** Stops every invitation to the address the token was sent to; an unknown token says so instead of pretending. */
export async function unsubscribeFromBusinessInvitations(token: string) {
  let unsubscribed: boolean;
  try {
    ({ unsubscribed } = await businessInvitations.unsubscribe(token));
  }
  catch {
    redirect(`/convites/descadastrado?resultado=indisponivel&token=${encodeURIComponent(token)}`);
  }
  redirect(`/convites/descadastrado?resultado=${unsubscribed ? "ok" : "desconhecido"}`);
}
