"use client";

import { useEffect, useRef } from "react";

export function CompletionHeading({ title }: { title: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
      Negócio salvo:
      {" "}
      {title}
    </h1>
  );
}
