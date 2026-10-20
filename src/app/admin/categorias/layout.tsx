import type { ReactNode } from "react";
import { CategoryUIComposition } from "@/integrations/categories/ui";

export default function CategoryLayout({ children }: { children: ReactNode }) {
  return <CategoryUIComposition>{children}</CategoryUIComposition>;
}
