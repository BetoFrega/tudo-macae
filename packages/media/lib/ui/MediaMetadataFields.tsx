"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@tudomacae/react-primitives/form";
import { Input } from "@tudomacae/react-primitives/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tudomacae/react-primitives/select";
import { Textarea } from "@tudomacae/react-primitives/textarea";
import {
  mediaKindLabels,
  mediaKinds,
  type MediaKind,
} from "@tudomacae/media/model";
import {
  displayBasisLabels,
  mediaOriginLabels,
  mediaOrigins,
  type MediaFormInput,
} from "../mediaForm";

interface MediaMetadataFieldsProps {
  form: UseFormReturn<MediaFormInput>;
  fixedKind?: MediaKind;
  allowPermission?: boolean;
}

export function MediaMetadataFields({
  form,
  fixedKind,
  allowPermission = true,
}: MediaMetadataFieldsProps) {
  const origin = useWatch({ control: form.control, name: "origin" });
  const displayBasis = useWatch({ control: form.control, name: "displayBasis" });

  return (
    <>
      {!fixedKind && (
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Espécie</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a espécie" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {mediaKinds.map(mediaKind => (
                    <SelectItem key={mediaKind} value={mediaKind}>
                      {mediaKindLabels[mediaKind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="alt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Texto alternativo</FormLabel>
            <FormControl>
              <Input placeholder="O que a imagem mostra, para quem não a vê" {...field} />
            </FormControl>
            <FormDescription>Descrição visual para leitores de tela. Não é exibida como legenda. Não precisa informar o uso de IA generativa.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="caption"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Legenda</FormLabel>
            <FormControl>
              <Textarea placeholder="Contexto editorial da imagem (opcional)" {...field} />
            </FormControl>
            <FormDescription>Contexto editorial junto da imagem. Opcional; não use alt, crédito ou aviso de geração por IA.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="origin"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Origem</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value: MediaFormInput["origin"]) => {
                field.onChange(value);
                form.setValue(
                  "displayBasis",
                  value === "own-production"
                    ? "own-production"
                    : value === "generated" ? "generated" : "license",
                );
              }}
            >
              <FormControl>
                <SelectTrigger><SelectValue /></SelectTrigger>
              </FormControl>
              <SelectContent>
                {mediaOrigins.map(value => (
                  <SelectItem key={value} value={value}>
                    {mediaOriginLabels[value]}
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
        name="creator"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Autoria</FormLabel>
            <FormControl><Input placeholder="Maria Souza" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="credit"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Crédito</FormLabel>
            <FormControl>
              <Input placeholder="Foto: Maria Souza/Tudo Macaé" {...field} />
            </FormControl>
            <FormDescription>Atribuição confirmada, em tamanho menor dentro da imagem. Para conteúdo gerado, use Tudo Macaé AI.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="acquiredAt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Data de aquisição</FormLabel>
            <FormControl><Input type="datetime-local" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {origin === "third-party" && (
        <>
          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornecedor original</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sourceUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL de origem</FormLabel>
                <FormControl><Input type="url" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="displayBasis"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fundamento de exibição</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(["license", ...(allowPermission ? ["permission" as const] : [])] as const).map(value => (
                      <SelectItem key={value} value={value}>
                        {displayBasisLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {displayBasis === "license" && (
            <FormField
              control={form.control}
              name="license"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Licença</FormLabel>
                  <FormControl><Input placeholder="CC BY 4.0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {displayBasis === "permission" && (
            <FormField
              control={form.control}
              name="permissionReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referência da permissão</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </>
      )}
    </>
  );
}
