"use client";
import type { Control } from "react-hook-form";
import { Checkbox } from "@tudomacae/react-primitives/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@tudomacae/react-primitives/form";
import { Input } from "@tudomacae/react-primitives/input";

import type { AdminAdvertiserProfileFormValues } from "./adminAdvertiserProfileEditorForm";

interface AdminAdvertiserProfileSourceFieldsProps {
  control: Control<AdminAdvertiserProfileFormValues>;
  disabled: boolean;
  showVerifySource: boolean;
  verifySource: boolean;
  onVerifySourceChange: (value: boolean) => void;
}

export function AdminAdvertiserProfileSourceFields({
  control,
  disabled,
  showVerifySource,
  verifySource,
  onVerifySourceChange,
}: AdminAdvertiserProfileSourceFieldsProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <FormField
        control={control}
        name="sourceUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Fonte pública</FormLabel>
            <FormControl>
              <Input
                type="url"
                placeholder="https://exemplo.com/contato-do-negocio"
                {...field}
              />
            </FormControl>
            <p className="text-sm/relaxed text-muted-foreground">
              Use uma página pública que apresente o contato informado como contato deste negócio.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
      {showVerifySource && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={verifySource} onCheckedChange={value => onVerifySourceChange(value === true)} />
          Conferi novamente esta fonte pública
        </label>
      )}
    </fieldset>
  );
}
