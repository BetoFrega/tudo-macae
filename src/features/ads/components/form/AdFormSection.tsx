import type { FileText } from "lucide-react";

interface AdFormSectionProps {
  icon: typeof FileText;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AdFormSection({ icon: Icon, title, description, children }: AdFormSectionProps) {
  return (
    <fieldset className="space-y-5">
      <legend className="w-full">
        <span className="flex items-start gap-3">
          <span className="
            flex size-9 shrink-0 items-center justify-center rounded-lg
            bg-primary/10 text-primary
          "
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="space-y-0.5">
            <span className="block text-base font-semibold text-foreground">{title}</span>
            <span className="
              block text-sm/relaxed font-normal text-muted-foreground
            "
            >
              {description}
            </span>
          </span>
        </span>
      </legend>
      <div className="
        space-y-5 pl-0
        sm:pl-12
      "
      >
        {children}
      </div>
    </fieldset>
  );
}
