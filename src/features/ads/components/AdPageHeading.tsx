"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function AdPageHeading({ id, className, cursor, invalidCursor, children }: {
  id: string;
  className: string;
  cursor?: string | undefined;
  invalidCursor: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (window.location.hash === "#anuncios") heading.current?.focus({ preventScroll: true });
  }, [cursor, invalidCursor]);
  return (
    <h2
      ref={heading}
      id={id}
      tabIndex={-1}
      className={`
        ${className}
        focus-visible:outline-2 focus-visible:outline-offset-4
        focus-visible:outline-current
      `}
    >
      {children}
    </h2>
  );
}
