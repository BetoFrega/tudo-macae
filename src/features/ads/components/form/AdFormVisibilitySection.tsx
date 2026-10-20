import { Eye } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import type { AdFormSchema } from "../../schemas/adFormSchema";
import { AdFormSection } from "./AdFormSection";

export function AdFormVisibilitySection({ form }: { form: UseFormReturn<AdFormSchema> }) {
  return (
    <AdFormSection
      icon={Eye}
      title="Visibilidade"
      description="Controle se o anúncio aparece nas listagens públicas."
    >
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem className="
            flex flex-row items-center justify-between gap-6 rounded-lg
            bg-secondary/70 p-4
          "
          >
            <div className="space-y-1">
              <FormLabel className="text-base">Anúncio Ativo</FormLabel>
              <FormDescription>
                Desative para pausar a exibição sem apagar o anúncio.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value === "active"}
                onCheckedChange={checked =>
                  field.onChange(checked ? "active" : "paused")}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </AdFormSection>
  );
}
