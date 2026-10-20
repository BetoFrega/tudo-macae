import type { ReactNode } from "react";

interface SiteHeaderFrameProps {
  brand: ReactNode;
  desktopNavigation: ReactNode;
  actions: ReactNode;
  contextRail: ReactNode;
  mobileContextRail?: ReactNode;
}

export function SiteHeaderFrame({ brand, desktopNavigation, actions, contextRail, mobileContextRail }: SiteHeaderFrameProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background shadow-sm">
      <div className="
        container mx-auto px-3
        lg:px-4
      "
      >
        <div className="
          flex min-h-16 flex-wrap items-center justify-between gap-2
          lg:gap-5
        "
        >
          {brand}
          <div className="
            hidden min-w-fit flex-1
            lg:block
          "
          >
            {desktopNavigation}
          </div>
          <div className="
            flex max-w-full flex-wrap items-center gap-1
            lg:gap-3
          "
          >
            {actions}
          </div>
        </div>
        {mobileContextRail}
        <div className="
          hidden
          lg:block
        "
        >
          {contextRail}
        </div>
      </div>
    </header>
  );
}
