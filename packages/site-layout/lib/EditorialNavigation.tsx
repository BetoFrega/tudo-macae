"use client";

import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { EditorialNavigationSheet } from "./EditorialNavigationSheet";
import type { EditorialNavigationProps } from "./navigationModel";

export { DesktopContextRail } from "./DesktopContextRail";
export { DesktopProductNavigation } from "./DesktopProductNavigation";
export type { EditorialNavigationProps, NavigationCategory, NavigationSection } from "./navigationModel";

export function MobileEditorialNavigation({
  categories,
  registrationAction,
  triggerId,
  publishingAction,
}: EditorialNavigationProps & { registrationAction?: ReactNode; triggerId?: string; publishingAction?: ReactNode }) {
  return (
    <EditorialNavigationSheet
      categories={categories}
      sections={[]}
      registrationAction={registrationAction}
      publishingAction={publishingAction}
      trigger={(
        <Button
          id={triggerId}
          variant="ghost"
          className="min-h-11 min-w-11 gap-2 px-2"
          aria-label="Abrir menu"
        >
          <Menu aria-hidden="true" className="size-5" />
          <span className="
            hidden
            min-[380px]:inline
          "
          >
            Menu
          </span>
        </Button>
      )}
    />
  );
}
