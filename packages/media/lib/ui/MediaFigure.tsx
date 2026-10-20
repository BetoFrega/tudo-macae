import type { ComponentProps } from "react";
import { MediaVisual } from "./MediaVisual";
import styles from "./MediaFigure.module.css";

export { MediaVisual } from "./MediaVisual";

function BelowCredit({ credit }: { credit: string | undefined }) {
  if (!credit?.trim()) return null;
  return <span className={styles.belowCredit} data-media-credit>{credit}</span>;
}

export function MediaFigure({ children, caption, credit, creditFocusable, creditPlacement = "overlay", visualClassName, ...props }: ComponentProps<"figure"> & {
  caption?: string | undefined;
  credit?: string | undefined;
  creditFocusable?: boolean | undefined;
  creditPlacement?: "overlay" | "below";
  visualClassName?: string | undefined;
}) {
  const belowCredit = creditPlacement === "below" && <BelowCredit credit={credit} />;
  return (
    <figure {...props}>
      <MediaVisual credit={creditPlacement === "overlay" ? credit : undefined} creditFocusable={creditFocusable} className={visualClassName}>{children}</MediaVisual>
      {caption?.trim()
        ? (
            <figcaption className={styles.caption}>
              <span className="block" data-media-caption>{caption}</span>
              {belowCredit}
            </figcaption>
          )
        : belowCredit}
    </figure>
  );
}
