import { MarkdownRenderer } from "macae-classificados";

const GUIDE = `
## Como anunciar em Macaé

Publicar um anúncio no Tudo Macaé leva menos de dois minutos.

1. Escolha a **categoria** que melhor descreve o que você oferece.
2. Escreva um título curto e específico — *"Apartamento 2 quartos em
   Cavaleiros"* funciona melhor que *"Apartamento à venda"*.
3. Adicione ao menos três fotos bem iluminadas.

> Anúncios com foto recebem, em média, **4x mais contatos**.

### Regras da comunidade

- Não é permitido anunciar produtos ilegais ou falsificados.
- Um anúncio por produto: duplicatas são removidas.
- Mantenha seus dados de contato atualizados.

Dúvidas? Fale com a gente em [contato@tudomacae.com.br](#).
`;

export const Article = () => (
  <div className="max-w-2xl">
    <MarkdownRenderer content={GUIDE} />
  </div>
);

export const Short = () => (
  <div className="max-w-lg">
    <MarkdownRenderer
      content={
        "**Anúncio expirado.** Renove para voltar a aparecer nas buscas. "
        + "Veja os [planos disponíveis](#)."
      }
    />
  </div>
);
