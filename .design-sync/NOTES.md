# design-sync notes — Tudo Macaé

Repo-specific gotchas for `/design-sync`. Read this before re-running.
Config lives in `config.json`; the conventions header the design agent reads is
`conventions.md`.

## Shape and entry

- This repo is a **Next.js app**, not a published component package. There is no
  `dist/`, so the converter runs in **synth-entry mode** — it bundles
  `src/components/ui/*.tsx` directly (`srcDir: "src/components/ui"`).
- `node_modules/macae-classificados` is a **self-referencing symlink to the repo
  root**, created by hand:

  ```sh
  ln -sfn ../ node_modules/macae-classificados
  ```

  Without it, `package-build.mjs` dies at `exportedNames()` with
  `ENOENT … node_modules/macae-classificados/package.json` — it resolves the
  package dir as `<node_modules>/<pkg>` and npm will not self-install. It also
  makes `import { Button } from "macae-classificados"` resolve inside preview
  files. **pnpm install wipes it — recreate it after every install.**
- 18 source files expand to **85 exported components**, because shadcn compound
  components export every part (`CardHeader`, `DialogTrigger`, `SelectItem`…).
  That is correct: each part is real API the design agent may need.

## Stylesheet

- Tailwind v4 source (`src/app/globals.css`) cannot be shipped as-is — it must
  be compiled first. That is what `cfg.buildCmd` does, writing
  `.design-sync/.cache/compiled.css`, which `cfg.cssEntry` points at.
  **Run `buildCmd` before every `package-build.mjs` run.**
- The compile input is `.design-sync/css-entry.css`, not globals.css directly.
  It imports globals.css and adds two things globals.css cannot provide:
  1. **A `@source inline(...)` safelist.** Tailwind only emits utilities it finds
     in scanned source, so a plain build covers only the classes *this app*
     happens to use. The design agent writes its own layout glue; anything not
     emitted is silently dead. The safelist force-generates the general layout /
     spacing / type / colour vocabulary (~320 KB output, up from ~100 KB).
  2. **`@source "./previews"`.** Preview compositions live outside the app source
     tree and are invisible to auto-detection. This was a real bug:
     `NavigationMenu`'s `w-[420px]` panel compiled to nothing and the card
     rendered collapsed to ~120px. Any arbitrary value in a preview needs this.

## Fonts

- The app loads **Geist / Geist Mono via `next/font/google`**, which only exists
  at Next build time. Nothing outside Next defines `--font-geist-sans` /
  `--font-geist-mono`, and `globals.css` only *reads* them
  (`--font-sans: var(--font-geist-sans)`), so the bundle rendered in a system
  fallback until this was wired up.
- The woff2 files are vendored in `.design-sync/fonts/` (from the `geist` npm
  package, SIL OFL 1.1) with `.design-sync/fonts/geist.css` supplying the
  `@font-face` rules, referenced by `cfg.extraFonts`.
- **The `:root` block binding the two custom properties must live in
  `css-entry.css`, not in `fonts/geist.css`.** The converter parses extraFonts
  files for `@font-face` rules only and drops everything else, so a `:root`
  block there never reaches the bundle. Verify after any font change:

  ```sh
  node -e "…" # or just check getComputedStyle(document.body).fontFamily starts with "Geist"
  ```

## Grouping and docs

- `cfg.docsDir` points at `.design-sync/docs`, which holds one **frontmatter-only
  stub per component** (`---\ncategory: Forms\n---`). These exist purely to group
  the 85 cards into Actions / Data Display / Forms / Feedback / Navigation /
  Overlays — without them everything lands in a single `general` group.
- **Deliberate choice: the stubs carry no body.** A matched doc *replaces* the
  synthesized `.prompt.md` entirely, and the synthesized version already carries
  the authored preview examples, which beats any short hand-written blurb.
  Per-component composition guidance lives in `conventions.md` instead.
  If you ever write a real body for a component, re-add its examples by hand.
- Regenerate stubs for newly added components with the loop in this file's git
  history, or just copy an existing stub and change `category`.

## Previews

- 26 of 85 components have authored previews in `.design-sync/previews/`; the
  other 59 ship the typographic floor card, which is the intended baseline.
- **`useDsForm`** (in `.design-sync/extra-exports.ts`, wired via
  `cfg.extraEntries`) re-exports react-hook-form's `useForm` from the bundle.
  A preview importing `useForm` straight from node_modules would bundle a second
  react-hook-form whose context the bundled `Form`/`FormItem` cannot see.
- `MarkdownRenderer` is a **default-only export**; the synth entry uses
  `export * from`, which does not carry defaults, so it failed
  `[BUNDLE_EXPORT]`. It is re-exported by name in `extra-exports.ts`. Any new
  default-only component in `src/components/ui/` needs the same treatment.
  (The build prints a benign `[EXPORT_COLLISION]` for it — the binding resolves
  correctly; verified via `window.MacaeDS.MarkdownRenderer`.)
- **Radix overlays** (`Dialog`, `Sheet`, `DropdownMenu`, `Select`) portal to
  `document.body` and are fixed/popper-positioned, so their previews render
  `open` under `cardMode: "single"` with an explicit viewport. Two things they
  need:
  - `onOpenAutoFocus={e => e.preventDefault()}` on Dialog/Sheet content —
    otherwise the first field autofocuses and the screenshot shows a selection
    highlight and focus ring.
  - **A real trigger element.** `DropdownMenuLabel`'s preview first shipped
    without one; the popper had nothing to measure against and collapsed
    (`[RENDER_BLANK]`).
- Form error states must go through `form.setError` in a `useEffect` — mutating
  `formState.errors` directly does nothing, because `FormMessage` reads the
  subscribed `useFormState` store.
- Layout-only sub-parts (`CardHeader`, `TableCell`, `SheetFooter`, …) render an
  empty element on the floor card and tripped `[RENDER_BLANK]`. Fixed by
  authoring each one *inside its parent* — the only render that is true anyway.

## Known render warns

- `[FONT_MISSING] "Cambria"` — **benign, expected every run.** Cambria appears
  only as a middle entry in Tailwind's default serif stack
  (`ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`), reached via
  the typography plugin. It is never a primary family; `ui-serif` and `Georgia`
  resolve everywhere. No action.
- `[EXPORT_COLLISION] MarkdownRenderer` — expected, see above.

## Re-sync risks

- **The symlink is not in git** (`node_modules/` is ignored). A fresh clone, or
  any `pnpm install` removes it and the build fails immediately.
  Recreating it is step one of every re-sync.
- **The safelist in `css-entry.css` is hand-maintained and will drift.** It was
  written against the token set in `globals.css` as of 2026-08-15. If tokens are
  added or renamed there, the colour blocks here go stale silently — the classes
  simply stop being emitted. Re-check the `@source inline` colour lists against
  `@theme inline` in globals.css whenever tokens change.
- **`conventions.md` names real classes and tokens.** Re-validate every name in
  it against the fresh build before uploading; a stale name makes the design
  agent emit vocabulary that does not resolve, and nothing downstream catches it.
- **The Geist version is pinned to whatever `.ds-sync/` last installed.** The
  woff2 files in `.design-sync/fonts/` are committed and will not update on
  their own; that is intentional (deterministic output), but means a Geist
  upgrade in the app would not be reflected here.
- **Only 4 sans + 3 mono weights are vendored** (400/500/600/700 and 400/500/700).
  A design using `font-extralight` or `font-black` gets synthetic or fallback
  rendering. Add the woff2 to `.design-sync/fonts/` and a rule to `geist.css`
  if that matters.
- **Interaction-only states are not covered** — hover, focus-visible, drag, and
  open/close transitions cannot render statically. The variant, size, disabled,
  error and open states are all covered.
- `docs/` in the repo root holds ADRs and research, not design guidelines, so
  `guidelines/` ships empty by design. If a real design-guidelines doc is ever
  written, point `cfg.guidelinesGlob` at it.
