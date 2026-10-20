import Link from "next/link";
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
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";

interface AdFormProfileSelectProps {
  form: UseFormReturn<AdFormSchema>;
  profiles: AdvertiserProfileData[];
  profileManagementHref?: string | undefined;
  contactSummaryId?: string | undefined;
}

export function AdFormProfileSelect({ form, profiles, profileManagementHref, contactSummaryId }: AdFormProfileSelectProps) {
  if (profiles.length <= 1) {
    return null;
  }

  return (
    <FormField
      control={form.control}
      name="advertiserProfileId"
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between">
            <FormLabel>Perfil do Anunciante</FormLabel>
            {profileManagementHref && (
              <Link
                href={profileManagementHref}
                className={`
                  text-sm font-medium text-primary underline-offset-4
                  hover:underline
                `}
              >
                Administrar perfis
              </Link>
            )}
          </div>
          {/* Controlled throughout, so defaultValue would never be consulted.
              An empty value shows the placeholder, matching "no profile yet". */}
          <Select
            onValueChange={field.onChange}
            value={field.value ?? ""}
          >
            <FormControl>
              <SelectTrigger className="h-11 w-full" aria-describedby={contactSummaryId}>
                <SelectValue placeholder="Selecione um perfil" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {profiles.map(profile => (
                <SelectItem key={profile.id} value={profile.id!}>
                  {profile.title || "Perfil Padrão"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
