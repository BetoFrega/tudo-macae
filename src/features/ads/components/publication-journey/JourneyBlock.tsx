import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function JourneyBlock({ name, title, summary, open, disabled, onOpen, children }: { name: string; title: string; summary: string; open: boolean; disabled?: boolean; onOpen: (name: string) => void; children: ReactNode }) {
  return (
    <section className="
      border-b
      last:border-b-0
    "
    >
      <h2>
        <button
          id={`publication-${name}`}
          type="button"
          aria-expanded={open}
          aria-controls={`publication-panel-${name}`}
          disabled={disabled}
          onClick={() => onOpen(open ? "" : name)}
          className="
            flex w-full items-center justify-between gap-4 p-5 text-left
            focus-visible:outline-2 focus-visible:outline-ring
            disabled:opacity-60
            sm:p-8
          "
        >
          <span className="min-w-0">
            <span className="block text-lg font-semibold">{title}</span>
            {!open && (
              <span className="
                mt-1 block truncate text-sm text-muted-foreground
              "
              >
                {summary}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`
              size-5 shrink-0
              ${open
      ? `rotate-180`
      : ""}
            `}
          />
        </button>
      </h2>
      <div
        id={`publication-panel-${name}`}
        hidden={!open}
        className="
          space-y-5 px-5 pb-6
          sm:px-8 sm:pb-8
        "
      >
        {children}
      </div>
    </section>
  );
}
