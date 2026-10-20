# Tudo Macaé — how to build with this design system

Tudo Macaé is a classifieds site for Macaé, Brazil. **All UI copy is Brazilian
Portuguese** — write labels, buttons and placeholders in pt-BR, and use pt-BR
formats: `R$ 2.400,00`, `1.284` for thousands, `dd/mm/aaaa`.

This is a **shadcn/ui "new-york" library on Tailwind CSS v4 with CSS variables**.

## Setup

**No provider or theme wrapper is needed.** Components read their design tokens
straight from CSS custom properties in the stylesheet, so any component renders
correctly on its own. The one exception is the form family: `FormItem`,
`FormField`, `FormLabel`, `FormControl`, `FormDescription` and `FormMessage` all
read react-hook-form context and must sit inside `<Form {...form}>` (`Form` *is*
`FormProvider`). Use the bundle's own `useDsForm` for the form instance — pulling
`useForm` from anywhere else creates a second react-hook-form whose context these
parts cannot see.

**Do not use `dark:` variants.** The `dark` variant compiles, but this system
defines no dark palette — the tokens have one set of values, so `dark:` classes
change nothing and only add noise. Build light-mode UI.

## Styling idiom: Tailwind utilities over semantic tokens

Style with Tailwind utility classes. **Always reach for the semantic colour
tokens below rather than raw palette colours** (`bg-primary`, never
`bg-blue-600`) — the palette is deliberately reset to these names only, so a raw
colour utility will not resolve.

| Family | Names (each works as `bg-*`, `text-*` and `border-*`) |
|---|---|
| Surfaces | `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground` |
| Brand | `primary`, `primary-foreground` (deep blue — the CTA colour) |
| Support | `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground` |
| Status | `destructive`, `success` (both take white text; there is no `success-foreground`) |
| Chrome | `border`, `input`, `ring` |
| Charts | `chart-1` … `chart-5` |
| Sidebar | `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-accent`, `sidebar-border`, `sidebar-ring` |

Every token also takes an opacity suffix: `bg-primary/90`, `text-muted-foreground/70`.

Other conventions worth following:

- **Radius**: `rounded-md` for controls, `rounded-lg` for cards and panels,
  `rounded-full` for badges and avatars. The scale derives from one `--radius`.
- **Type**: `font-sans` (Geist) is the default; `font-mono` is Geist Mono.
  Secondary text is `text-sm text-muted-foreground` — that pairing carries most
  of the hierarchy in this app.
- **Long-form prose** goes through `MarkdownRenderer`, which applies the
  typography plugin. Do not hand-style article body copy.
- Three helpers ship alongside the components: `navigationMenuTriggerStyle()`
  (use it on a `NavigationMenuLink` so a plain link matches the height of items
  that open a panel), plus `buttonVariants()` and `badgeVariants()` for applying
  those looks to a non-button element.

## Where the truth is

- **`_ds/<folder>/styles.css`** and the files it imports — the real compiled
  stylesheet, including every token definition. Read it before inventing a
  colour or spacing value.
- **`components/<group>/<Name>/<Name>.prompt.md`** — per-component usage, with
  worked examples for the 26 components that have authored previews.
- **`components/<group>/<Name>/<Name>.d.ts`** — the exact props. Compound
  components ship every part as its own export (`Card` + `CardHeader` +
  `CardTitle` + …); compose them, don't rebuild them from divs.

## An idiomatic composition

```jsx
<Card className="max-w-sm">
  <CardHeader>
    <CardTitle>Apartamento 2 quartos — Cavaleiros</CardTitle>
    <CardDescription>Macaé, RJ · publicado há 2 dias</CardDescription>
    <CardAction>
      <Badge>Imóveis</Badge>
    </CardAction>
  </CardHeader>
  <CardContent>
    <p className="text-2xl font-bold">R$ 2.400/mês</p>
    <p className="mt-2 text-sm text-muted-foreground">
      Varanda com vista para o mar, 1 vaga de garagem, portaria 24h.
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button>Falar com anunciante</Button>
    <Button variant="outline">Salvar</Button>
  </CardFooter>
</Card>
```

Library components carry the control; utility classes carry only the layout glue
around them (`max-w-sm`, `gap-2`, `mt-2`). Keep that split — reaching for
`className` to restyle a component's internals is a sign the wrong variant or
part is being used.
