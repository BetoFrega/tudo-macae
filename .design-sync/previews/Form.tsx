import { useEffect } from "react";
import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  useDsForm,
} from "macae-classificados";

// `Form` is react-hook-form's FormProvider — every FormField/FormItem below
// reads its context, so the whole composition is the only render that is true.
// useDsForm is the bundle's own useForm (see .design-sync/extra-exports.ts).
export const AdForm = () => {
  const form = useDsForm({
    defaultValues: {
      titulo: "Apartamento 2 quartos — Cavaleiros",
      preco: "2400",
      descricao:
        "Varanda com vista para o mar, 1 vaga de garagem, condomínio com "
        + "piscina e portaria 24h.",
    },
  });

  return (
    <Form {...form}>
      <form className="grid max-w-md gap-6">
        <FormField
          name="titulo"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título do anúncio</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                Seja específico — títulos claros recebem mais contatos.
              </FormDescription>
            </FormItem>
          )}
        />
        <FormField
          name="preco"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preço mensal (R$)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          name="descricao"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Publicar anúncio</Button>
      </form>
    </Form>
  );
};

export const WithValidationError = () => {
  const form = useDsForm({ defaultValues: { email: "voce@" } });
  // setError through the real API — mutating formState.errors directly does
  // nothing, because FormMessage reads the subscribed useFormState store.
  useEffect(() => {
    form.setError("email", {
      type: "manual",
      message: "Informe um e-mail válido.",
    });
  }, [form]);

  return (
    <Form {...form}>
      <form className="grid max-w-md gap-6">
        <FormField
          name="email"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail de contato</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
