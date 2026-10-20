import type { ReactNode } from "react";

export default function TermsPageFrame({ children }: { children: ReactNode }) {
  return (
    <article
      id="terms-content"
      className="container mx-auto max-w-2xl px-4 py-8"
    >
      {children}
    </article>
  );
}
