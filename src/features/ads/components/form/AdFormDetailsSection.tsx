import { FileText } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_TITLE_LENGTH,
  MIN_TEXT_LENGTH,
  MAX_TEXT_LENGTH,
  type AdFormSchema,
} from "../../schemas/adFormSchema";
import type { Category, Subcategory } from "@tudomacae/categories/model";
import { AdFormCategorySelect } from "./AdFormCategorySelect";
import { AdFormSection } from "./AdFormSection";

interface AdFormDetailsSectionProps {
  form: UseFormReturn<AdFormSchema>;
  activeCategories: Category[];
  activeSubcategories: Subcategory[];
  selectedCategoryId: string;
}

export function AdFormDetailsSection({ form, activeCategories, activeSubcategories, selectedCategoryId }: AdFormDetailsSectionProps) {
  const titleValue = useWatch({ control: form.control, name: "title" });
  const titleLength = titleValue?.length || 0;
  const textValue = useWatch({ control: form.control, name: "text" });
  const textLength = textValue?.length || 0;
  return (
    <AdFormSection
      icon={FileText}
      title="Informações do anúncio"
      description="Use informações claras para ajudar as pessoas a entender a oferta."
    >
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-baseline justify-between gap-4">
              <FormLabel>Título do Anúncio</FormLabel>
              <AdFormCharacterCount current={titleLength} maximum={MAX_TITLE_LENGTH} />
            </div>
            <FormControl>
              <Input
                placeholder="Ex.: Honda Civic 2020 em ótimo estado"
                maxLength={MAX_TITLE_LENGTH}
                className="h-11"
                {...field}
              />
            </FormControl>
            <FormDescription>
              Diga de forma direta o que você está anunciando.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <AdFormCategorySelect
        form={form}
        activeCategories={activeCategories}
        activeSubcategories={activeSubcategories}
        selectedCategoryId={selectedCategoryId}
      />

      <FormField
        control={form.control}
        name="text"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-baseline justify-between gap-4">
              <FormLabel>Texto do Anúncio</FormLabel>
              <AdFormCharacterCount current={textLength} maximum={MAX_TEXT_LENGTH} />
            </div>
            <FormControl>
              <Textarea
                placeholder="Descreva os detalhes importantes, o estado do item e as condições da oferta."
                className="min-h-40 resize-y leading-relaxed"
                minLength={MIN_TEXT_LENGTH}
                maxLength={MAX_TEXT_LENGTH}
                rows={7}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Inclua o que a pessoa precisa saber antes de entrar em contato.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </AdFormSection>
  );
}

function AdFormCharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return (
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
      {current}
      /
      {maximum}
    </span>
  );
}
