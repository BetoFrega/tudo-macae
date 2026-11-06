import type { BusinessClaimNotice } from "@tudomacae/advertiser-identity/businessClaim";
import type { AuthenticationMail } from "./workerDependencies";

export type BusinessClaimMail = Omit<AuthenticationMail, "from">;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

/** Tells the claimant the decision; the approved owner gets the link to their Business's welcome. */
export function businessClaimMail(notice: BusinessClaimNotice, publicOrigin: string): BusinessClaimMail {
  const title = notice.businessTitle || "o negócio";
  if (notice.outcome === "approved") {
    const url = new URL(`/minha-conta/negocios/${encodeURIComponent(notice.businessId)}/assumido`, publicOrigin).href;
    return {
      to: notice.claimantEmail,
      subject: `Você agora administra ${title} no Tudo Macaé`,
      text: `Seu pedido para assumir ${title} foi aprovado. Agora a página é da sua conta.\n${url}`,
      html: `<p>Seu pedido para assumir ${escapeHtml(title)} foi aprovado. Agora a página é da sua conta.</p><p><a href="${escapeHtml(url)}">Ver próximos passos</a></p>`,
    };
  }
  const reason = notice.reason ? `\nMotivo: ${notice.reason}` : "";
  return {
    to: notice.claimantEmail,
    subject: `Seu pedido para assumir ${title} não foi aprovado`,
    text: `Seu pedido para assumir ${title} no Tudo Macaé não foi aprovado.${reason}`,
    html: `<p>Seu pedido para assumir ${escapeHtml(title)} no Tudo Macaé não foi aprovado.</p>${notice.reason ? `<p>Motivo: ${escapeHtml(notice.reason)}</p>` : ""}`,
  };
}
