"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Suspense } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Checkbox } from "@tudomacae/react-primitives/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@tudomacae/react-primitives/form";
import { Input } from "@tudomacae/react-primitives/input";
import type { Category } from "../../model";

export const categoryFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1, "Slug é obrigatório"),
  order: z.number().finite(),
  businessOrder: z.number().finite().optional(),
  preferredLayer: z.enum(["ads", "businesses"]).optional(),
  isActive: z.boolean(),
  icon: z.string().optional(),
});

export type CategoryFormData = z.infer<typeof categoryFormSchema>;

interface CategoryFormProps {
  initialData?: Category;
  onSubmit: (values: CategoryFormData) => Promise<{ success: boolean; error?: string }>;
}

function categoryFormDefaults(initialData: Category | undefined) {
  if (!initialData) {
    return { name: "", slug: "", order: 0, businessOrder: undefined, preferredLayer: undefined, isActive: true, icon: "" };
  }
  return {
    name: initialData.name || "",
    slug: initialData.slug || "",
    order: initialData.order || 0,
    businessOrder: initialData.businessOrder,
    preferredLayer: initialData.preferredLayer,
    isActive: initialData.isActive ?? true,
    icon: initialData.icon || "",
  };
}

export function CategoryForm({ initialData, onSubmit }: CategoryFormProps) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: categoryFormDefaults(initialData),
  });

  async function handleSubmit(values: CategoryFormData) {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result?.success === false) {
        alert(result.error || "Erro ao salvar categoria.");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Imóveis" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="Ex: imoveis" {...field} />
              </FormControl>
              <FormDescription>
                Usado na URL. Deve ser único e sem espaços.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ordem</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  {...field}
                  onChange={e => field.onChange(e.target.valueAsNumber)}
                />
              </FormControl>
              <FormDescription>
                Ordem de exibição (menor número aparece primeiro).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="businessOrder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ordem em Negócios</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  value={field.value ?? ""}
                  onChange={event => field.onChange(event.target.value === "" ? undefined : event.target.valueAsNumber)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormDescription>Opcional. Em branco, usa a ordem compartilhada.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="preferredLayer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Primeira camada pública</FormLabel>
              <FormControl>
                <select
                  className="
                    flex min-h-11 w-full rounded-md border border-input
                    bg-background px-3 text-sm
                  "
                  value={field.value ?? ""}
                  onChange={event => field.onChange(event.target.value || undefined)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                >
                  <option value="">Padrão: Anúncios</option>
                  <option value="ads">Anúncios</option>
                  <option value="businesses">Negócios</option>
                </select>
              </FormControl>
              <FormDescription>Subcategorias herdam esta preferência. Uma camada vazia não ocupa a primeira posição.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className={`
              flex flex-row items-start space-y-0 space-x-3 rounded-md border
              p-4
            `}
            >
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Ativo</FormLabel>
                <FormDescription>
                  Se desmarcado, a categoria não aparecerá para novos anúncios.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ícone</FormLabel>
              <div className="flex items-center gap-4">
                <FormControl>
                  <Input placeholder="Ex: home, shopping-cart" {...field} />
                </FormControl>
                <div className={`
                  flex size-10 items-center justify-center rounded-md border
                  bg-muted
                `}
                >
                  <Suspense fallback={null}>
                    {field.value && (
                      <DynamicIcon
                        name={field.value as IconName}
                        className="size-6"
                      />
                    )}
                  </Suspense>
                </div>
              </div>
              <FormDescription>
                Nome do ícone Lucide (kebab-case). Veja a lista em
                {" "}
                <a
                  href="https://lucide.dev/icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  lucide.dev/icons
                </a>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Salvando..."
            : initialData
              ? "Salvar Alterações"
              : "Criar Categoria"}
        </Button>
      </form>
    </Form>
  );
}
