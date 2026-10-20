import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Loading({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("m-10 flex items-center justify-center", className)}
      {...props}
    >
      <div>
        <Loader2 className="mr-2 inline animate-spin" />
        Carregando...
      </div>
    </div>
  );
}
