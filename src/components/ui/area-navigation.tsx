"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AreaNavigationItem = {
  href: string;
  label: string;
};

export function AreaNavigation({ items, label }: { items: AreaNavigationItem[]; label?: string }) {
  const pathname = usePathname();
  const currentHref = items
    .filter(item => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav
      aria-label={label}
      className={`
        grid grid-cols-2 gap-2
        sm:grid-cols-3
        md:flex md:flex-col
      `}
    >
      {items.map((item) => {
        const isCurrent = currentHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className={`
              min-h-11 rounded-sm p-2
              hover:bg-accent
              ${isCurrent ? "bg-accent font-medium text-primary" : ""}
            `}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
