"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./classNames";
import styles from "./MediaFigure.module.css";

export function MediaVisual({ children, credit, creditFocusable = true, className }: {
  children: ReactNode;
  credit?: string | undefined;
  creditFocusable?: boolean | undefined;
  className?: string | undefined;
}) {
  const visual = useRef<HTMLSpanElement>(null);
  const suppressActivation = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const hasCredit = Boolean(credit?.trim());

  useEffect(() => {
    if (!hasCredit) return;
    function dismiss(event: KeyboardEvent) {
      const element = visual.current;
      const active = document.activeElement;
      if (event.key === "Escape" && element && (element.matches(":hover") || element.contains(active) || (active?.matches("a, button") && active.contains(element)))) setDismissed(true);
    }
    const owner = visual.current?.closest("a, button");
    const reset = () => setDismissed(false);
    owner?.addEventListener("focus", reset);
    document.addEventListener("keydown", dismiss);
    return () => {
      owner?.removeEventListener("focus", reset);
      document.removeEventListener("keydown", dismiss);
    };
  }, [hasCredit]);

  function reveal() {
    setDismissed(false);
  }

  return (
    <span
      ref={visual}
      className={cn(styles.visual, className)}
      data-media-visual
      data-credit-dismissed={dismissed || undefined}
      tabIndex={hasCredit ? (creditFocusable ? 0 : -1) : undefined}
      onPointerEnter={reveal}
      onFocus={reveal}
      onPointerDown={(event) => {
        if (hasCredit && event.pointerType === "touch") {
          // The first touch inspects attribution; a second touch activates the enclosing link.
          suppressActivation.current = !creditFocusable && Boolean(event.currentTarget.closest("a")) && document.activeElement !== event.currentTarget;
          reveal();
          event.currentTarget.focus();
        }
      }}
      onClick={(event) => {
        if (suppressActivation.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressActivation.current = false;
        }
      }}
    >
      {children}
      {hasCredit && <span className={styles.credit} data-media-credit>{credit}</span>}
    </span>
  );
}
