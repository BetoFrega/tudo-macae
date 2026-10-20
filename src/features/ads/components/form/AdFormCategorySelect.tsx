import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UseFormReturn } from "react-hook-form";
import { AdFormSchema } from "../../schemas/adFormSchema";
import type { Category, Subcategory } from "@tudomacae/categories/model";

interface AdFormCategorySelectProps {
  form: UseFormReturn<AdFormSchema>;
  activeCategories: Category[];
  activeSubcategories: Subcategory[];
  selectedCategoryId: string;
}

export function AdFormCategorySelect({
  form,
  activeCategories,
  activeSubcategories,
  selectedCategoryId,
}: AdFormCategorySelectProps) {
  return (
    <div className={`
      grid grid-cols-1 gap-4
      sm:grid-cols-2
    `}
    >
      <FormField
        control={form.control}
        name="categoryId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Categoria</FormLabel>
            <Select
              onValueChange={(value) => {
                // Empty native-select mount events must not erase a restored draft.
                if (value) field.onChange(value);
              }}
              defaultValue={field.value}
              value={field.value}
            >
              <FormControl>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {activeCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="subcategoryId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Subcategoria</FormLabel>
            <Select
              onValueChange={(value) => {
                // Empty native-select mount events must not erase a restored draft.
                if (value) field.onChange(value);
              }}
              defaultValue={field.value}
              value={field.value}
              disabled={!selectedCategoryId}
            >
              <FormControl>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Selecione uma subcategoria" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {activeSubcategories.map(sub => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
