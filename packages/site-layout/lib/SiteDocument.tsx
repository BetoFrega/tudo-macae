import type { ReactNode } from "react";

export function SiteDocument({ children, fontClassName }: { children: ReactNode; fontClassName: string }) {
  return (
    <html lang="pt-BR">
      <body className={`
        ${fontClassName}
        antialiased
      `}
      >
        {children}
      </body>
    </html>
  );
}
