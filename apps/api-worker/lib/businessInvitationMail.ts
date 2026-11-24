import type { BusinessInvitationMessage } from "@tudomacae/advertiser-identity/businessInvitation";
import type { BusinessClaimMail } from "./businessClaimMail";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

/** Site path of the confirmation page an unsubscribe link opens; the page asks before it suppresses the address. */
export function businessInvitationUnsubscribePath(token: string) {
  return `/convites/descadastrar/${encodeURIComponent(token)}`;
}

/** The product owner approves every change to this text before the next send (D-PdM-07). */
export function businessInvitationMail(message: BusinessInvitationMessage, publicOrigin: string): BusinessClaimMail {
  const claimUrl = new URL(message.claimPath, publicOrigin).href;
  const unsubscribeUrl = new URL(businessInvitationUnsubscribePath(message.unsubscribeToken), publicOrigin).href;
  const title = message.businessTitle;
  const subject = `${title} já está no Tudo Macaé. Assuma a página do seu negócio`;
  const paragraphs = [
    `Olá! ${title} aparece no catálogo de negócios do Tudo Macaé, o site de notícias e classificados de Macaé. Montamos a página com informações públicas, e ela ainda não tem um responsável.`,
    "Assumir a página é gratuito. Depois de aprovado, você corrige telefone e WhatsApp, troca a foto, escolhe as categorias e publica anúncios em nome do negócio.",
    "Para pedir, entre com uma conta do Tudo Macaé e informe o CNPJ do negócio. Nossa equipe confere os dados e responde por e-mail.",
  ];
  const origin = `Encontramos este endereço no cadastro público de CNPJ da Receita Federal. Se você não quer mais receber convites do Tudo Macaé, descadastre-se: ${unsubscribeUrl}`;
  return {
    to: message.to,
    subject,
    text: [...paragraphs, `Assumir a página: ${claimUrl}`, origin].join("\n\n"),
    html: [
      ...paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`),
      `<p><a href="${escapeHtml(claimUrl)}">Assumir a página de ${escapeHtml(title)}</a></p>`,
      `<p style="color:#555;font-size:13px">Encontramos este endereço no cadastro público de CNPJ da Receita Federal. Se você não quer mais receber convites do Tudo Macaé, <a href="${escapeHtml(unsubscribeUrl)}">descadastre-se</a>.</p>`,
    ].join(""),
  };
}
