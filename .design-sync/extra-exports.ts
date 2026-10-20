// Named re-exports for design-sync.
//
// The synthesized bundle entry uses `export * from "<file>"`, which does not
// carry default exports. Any ui/ component that only has a default export
// therefore never lands on `window.MacaeDS` ([BUNDLE_EXPORT] at validate).
// Re-export those here under their component name; wired via cfg.extraEntries.
export { default as MarkdownRenderer } from "../src/components/ui/MarkdownRenderer";

// `Form` is react-hook-form's FormProvider, and FormItem/FormField read its
// context. A preview that pulled `useForm` straight from node_modules would
// bundle a SECOND react-hook-form copy whose context the bundled Form parts
// cannot see. Re-exporting it here keeps previews on the bundle's own copy.
export { useForm as useDsForm } from "react-hook-form";
