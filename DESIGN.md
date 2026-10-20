---
name: "Tudo Macaé"
description: "Um mural vivo, cívico e acessível para a vida cotidiana de Macaé."
colors:
  macae-blue: "oklch(43.989% 0.30488 264.073)"
  atlantic-white: "oklch(100% 0.00011 271.152)"
  pure-white: "oklch(100% 0 0)"
  deep-ink: "oklch(10% 0.15244 264.073)"
  card-ink: "oklch(12.9% 0.042 264.695)"
  credit-ink: "#0f172a"
  neutral-card: "oklch(98% 0 0)"
  warm-orange: "oklch(75% 0.16 55)"
  warm-orange-hover: "oklch(70% 0.16 55)"
  warm-ink: "oklch(22% 0.04 55)"
  editorial-orange: "oklch(48% 0.12 45)"
  warm-wash: "oklch(96% 0.025 65)"
  blue-accent: "oklch(43.989% 0.30488 264.073 / 30%)"
  cool-mist: "oklch(96.8% 0.007 247.896)"
  quiet-slate: "oklch(55.4% 0.046 257.417)"
  cool-line: "oklch(92.9% 0.013 255.508)"
  focus-slate: "oklch(70.4% 0.04 256.788)"
  danger-red: "oklch(57.7% 0.245 27.325)"
  success-green: "oklch(30.936% 0.09324 136.737)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.111
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.429
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
  credit:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control-xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "9999px"
spacing:
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.macae-blue}"
    textColor: "{colors.atlantic-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.atlantic-white}"
    textColor: "{colors.deep-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  badge-secondary:
    backgroundColor: "{colors.cool-mist}"
    textColor: "{colors.card-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card-default:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Tudo Macaé

## Overview

**Creative North Star: "O Mural Vivo de Macaé"**

O sistema visual funciona como um mural local contemporâneo: direto o bastante para localizar informação depressa, aberto o bastante para receber notícias e classificados como partes da mesma vida cotidiana. O Azul Macaé cria reconhecimento imediato; o Branco Atlântico mantém a leitura clara e dá espaço para conteúdos muito diferentes coexistirem.

A atmosfera é cívica, acessível, otimista e prática. A interface usa densidade confortável, hierarquia tipográfica inequívoca e interação gentilmente tátil. Ela não tenta parecer um marketplace genérico de big tech, um portal burocrático municipal ou um site de notícias sensacionalista.

**Key Characteristics:**

- Identidade azul com laranja quente reservado a destaques.
- Superfícies claras com camadas serenas.
- Tipografia de sistema direta e inclusiva.
- Cantos suaves, bordas discretas e estados evidentes.
- Movimento funcional, nunca coreografia gratuita.

## Colors

A paleta combina o Azul Macaé, elétrico e cívico, com o Branco Atlântico e neutros frios que deixam conteúdo, imagens e estados assumirem a hierarquia.

### Primary

- **Azul Macaé:** concentra marca, links, navegação e ações operacionais.
- **Neutro Claro:** cria fundos de cartões sem competir com o conteúdo.
- **Azul de Ênfase:** sinaliza hover e seleção com transparência, preservando a mesma voz cromática.

### Neutral

- **Branco Atlântico:** fundo dominante das páginas.
- **Branco Puro:** popovers, diálogos e superfícies que precisam se separar do plano de fundo.
- **Tinta Profunda:** texto de alto contraste com parentesco cromático com a marca.
- **Névoa Fria:** ações secundárias, estados suaves e áreas de apoio.
- **Ardósia Silenciosa:** texto secundário e metadados.
- **Linha Fria:** bordas, divisores e campos.
- **Ardósia de Foco:** anéis de foco que permanecem visíveis sem introduzir outra cor de marca.

### Tertiary

- **Vermelho de Alerta:** destruição, erro e estado inválido.
- **Verde de Confirmação:** sucesso explícito; nunca ornamentação.

### Named Rules

**The Selective Warm Accent Rule.** O Azul Macaé identifica marca, links e navegação. Laranja quente destaca as chamadas para anunciar; a manchete principal usa laranja escuro. Vermelho e verde continuam reservados a estados.

**The Content First Rule.** Fundos e bordas permanecem frios e discretos para que texto, mídia e informação local liderem.

## Typography

**Display Font:** pilha nativa do sistema, com Segoe UI e Roboto como fallbacks principais  
**Body Font:** a mesma pilha nativa do sistema  
**Logo Lettering:** Graphik Semibold, incorporada ao ativo do logotipo e não usada como fonte de interface

**Character:** A tipografia é familiar, rápida e sem afetação. Peso e escala constroem a hierarquia; a interface não depende de uma família editorial decorativa para parecer local ou confiável.

### Hierarchy

- **Display** (700, 36px, 40px): títulos centrais de maior expressão em telas médias ou maiores.
- **Headline** (700, 30px, 36px): títulos de página e seções principais em telas compactas.
- **Title** (600, 20px, 28px): títulos de cartões, categorias e blocos operacionais.
- **Body** (400, 16px, 24px): leitura corrente, descrições e conteúdo; textos auxiliares podem usar 14px.
- **Label** (500, 14px, 20px): botões, campos, navegação e metadados; 12px fica restrito a chips e detalhes curtos.
- **Caption**: legendas de imagens usam o token `typography.caption`, com quebra de linha livre e ampliação relativa ao texto.

### Named Rules

**The Logo Is an Asset Rule.** Graphik pertence ao desenho do logotipo; texto de produto usa a pilha nativa realmente renderizada.

**The Weight Before Decoration Rule.** Crie hierarquia com tamanho, peso e espaço antes de introduzir cor, caixa alta ou ornamento.

**The Image Metadata Rule.** O texto alternativo pertence ao atributo `alt`; a legenda editorial fica junto da imagem e pode estar vazia. O conteúdo dos metadados segue o glossário de Mídia. O crédito usa `typography.credit` dentro da área visual, em `colors.credit-ink` oculto por padrão e revelado em hover ou foco, sobre branco translúcido a 70%, com quebra livre e ampliação relativa ao texto. Teclado e toque focam a área visual; capas vinculadas usam o foco do link pelo teclado e dois toques na imagem: revelar crédito, depois abrir o destino. Seletores em botão mantêm o crédito visível no toque e escolha direta. Escape oculta o crédito até uma nova entrada de ponteiro ou foco. As figuras do corpo usam esse mesmo crédito sobreposto. Nenhum campo substitui outro. O aviso de IA permanece independente ao final da Matéria.

## Layout

As páginas usam um contêiner central de largura fluida com 16px de margem interna horizontal e 32px de ritmo vertical na maioria das rotas. Conteúdo de leitura e formulários estreitam para larguras focadas; listagens e navegação usam a largura disponível.

O ritmo é baseado principalmente em passos de 8px, com 16px para agrupamento próximo, 24px para composição interna e 32–48px entre regiões. A grade geral de anúncios forma uma coluna no celular, duas a partir de 768px e três a partir de 1024px. Navegação, rodapé e áreas administrativas mudam de pilha para linha quando há espaço suficiente.

Imagens do corpo da Matéria preservam a proporção original, com altura automática e largura limitada ao texto, sem quadro fixo, recorte, fundo, borda ou máscara de cantos. Durante o carregamento, uma estimativa reserva espaço até as dimensões originais serem conhecidas.

Categorias da home usam grupos de expansão nativos em duas colunas, três a partir de 640px e quatro a partir de 1024px. Abaixo deles, os anúncios recentes ocupam oito de 12 colunas no desktop, com dois cartões por linha; o painel de publicação ocupa quatro colunas ao lado. Em telas menores, o painel precede os anúncios.

Verifique a composição com `sed -n '1,260p' src/app/page.tsx src/features/navigation/HomepageCategoryNav.tsx` e a grade geral com `cat src/features/ads/components/AdGrid.tsx`.

**The One-to-Two-to-Three Rule.** A grade geral de anúncios cresce de uma para duas e três colunas sem comprimir cartões abaixo de uma leitura confortável; a composição da home limita seus anúncios a duas colunas no desktop.

**The Narrow Task Rule.** Formulários e leitura detalhada usam limites de largura próprios; não estique uma tarefa focal só porque o contêiner permite.

## Elevation & Depth

O sistema usa camadas serenas. Superfícies permanecem quase planas e ganham separação por tonalidade, borda fina e sombra baixa. O cabeçalho fixo e os cartões usam elevação ambiente discreta; hover pode elevar um cartão; diálogos e painéis temporários recebem a sombra estrutural mais forte.

### Shadow Vocabulary

- **Micro:** sombra de 1px em campos e controles para separação tátil mínima.
- **Ambient Low:** sombra curta e difusa em cabeçalho e cartões em repouso.
- **Interactive Lift:** sombra mais ampla para hover de cartões e chamadas principais.
- **Modal:** sombra estrutural profunda reservada para diálogos e sheets.

### Named Rules

**The Quiet at Rest Rule.** Superfícies em repouso usam no máximo elevação ambiente baixa; sombra forte comunica estado ou sobreposição.

## Shapes

A geometria é suave sem ser infantil. Controles usam cantos de 6–8px, diálogos e painéis usam 10px, cartões de conteúdo usam 14px e badges usam cápsulas completas. Bordas frias e finas definem campos e contêineres; áreas vazias usam borda tracejada para sinalizar disponibilidade, não erro.

**The Soft, Not Bubbly Rule.** Preserve cantos suavemente curvos, mas reserve a forma de cápsula para badges, switches e identidades circulares.

## Components

### Buttons

- **Highlight:** variante `highlight` em Laranja Quente, texto Tinta Quente, hover mais escuro e foco com contorno visível. Usada em Anunciar no cabeçalho e Criar Anúncio no menu da conta. A chamada da home usa fundo quente suave e chamada interna laranja; a manchete principal usa Laranja Editorial.

- **Shape:** retângulos suavemente arredondados, normalmente com raio de 8px e alturas de 32, 36 ou 40px.
- **Primary:** Azul Macaé, texto branco em negrito, borda secundária de 2px e padding horizontal de 16px.
- **Hover / Focus:** redução tonal discreta no hover; foco usa borda e anel de 3px em Ardósia de Foco sem remover o outline sem substituto.
- **Secondary / Ghost / Link:** neutros frios ou fundo transparente; links usam Azul Macaé e sublinhado apenas no hover.

### Chips

- **Style:** badges em cápsula, 12px, com Azul Macaé para o estado dominante e Névoa Fria para categorias secundárias.
- **State:** hover muda apenas a intensidade; destructive é reservado a semântica de risco.

### Cards / Containers

- **Corner Style:** cartões principais usam curvas generosas de 14px.
- **Background:** Neutro Claro sobre o Branco Atlântico; superfícies modais usam Branco Puro.
- **Shadow Strategy:** elevação ambiente baixa em repouso e Interactive Lift no hover quando o cartão é acionável.
- **Border:** uma Linha Fria fina preserva o contorno em fundos claros.
- **Internal Padding:** 24px como composição padrão; cartões de anúncio podem usar 16px em regiões densas.

### Business Directory Rows

As listas de negócios usam divisores horizontais, com avatar ao lado da identificação em todas as larguras. Contatos ficam abaixo do texto em telas compactas e em uma terceira coluna a partir de 1280px; títulos, descrições e áreas de atuação quebram sem provocar rolagem horizontal. Links de contato têm altura mínima de 44px, e identificação, categorias e contatos recebem foco visível. Verifique a implementação com `rg -n "grid-cols|wrap-anywhere|min-h-11|focus-visible" src/features/business/BusinessCard.tsx`.

### Inputs / Fields

- **Style:** fundo transparente, borda Linha Fria, raio de 8px, altura de 36px e padding horizontal de 12px.
- **Focus:** borda Ardósia de Foco e anel externo translúcido de 3px.
- **Error / Disabled:** vermelho semântico com anel translúcido; disabled reduz opacidade e impede interação.

### Navigation

O cabeçalho é fixo, branco e levemente elevado. A marca lidera à esquerda; autenticação e a ação de anunciar ficam à direita. Categorias usam triggers compactos de 14px, cantos de 8px e Névoa Fria no hover ou estado aberto. Em telas compactas, marca, conta e Menu ficam na mesma linha quando couberem. A linha principal e o grupo de ações podem quebrar dentro da largura disponível quando a tela ou o texto ampliado exigir, preservando controles e nomes sem rolagem horizontal. Verifique o frame compartilhado com `rg -n "flex-wrap|max-w-full" packages/site-layout/lib/SiteHeaderFrame.tsx`. O painel de navegação oferece Negócios e Classificados, revela subcategorias por expansão e mantém Anunciar grátis no rodapé. A lista rola dentro do painel; fechar devolve o foco ao botão Menu. Controles mobile têm área de toque mínima de 44px.

### Homepage Category Disclosure

Categorias da home usam `details` e `summary`, separadas por bordas superiores discretas. O título azul de 14px tem peso 600 e alvo mínimo de 48px; o chevron gira quando o grupo abre e respeita movimento reduzido. O conteúdo expandido oferece “Ver todos” e links de subcategorias com alvos mínimos de 44px. O foco do resumo permanece visível; links recebem sublinhado no hover.

## Do's and Don'ts

### Do:

- **Do** use Azul Macaé for brand recognition, primary action and navigational emphasis.
- **Do** preserve the 8px rhythm and use 24px as the default card composition space.
- **Do** let borders and tonal surfaces establish structure before adding shadow.
- **Do** keep hover, focus, invalid and disabled states visually explicit.
- **Do** grow the general ad grid from one to two to three columns; preserve compact category disclosures and two-column desktop ad region.

### Don't:

- **Don't** spread the warm accent across ordinary navigation, cards or status indicators.
- **Don't** use danger red or success green as decoration.
- **Don't** apply permanent heavy shadows to resting surfaces.
- **Don't** use Graphik outside the existing logo asset unless the brand typography is deliberately redesigned.
- **Don't** animate content without an interaction, state change or directional purpose.
