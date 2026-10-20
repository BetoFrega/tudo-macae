"use client";
import { useIdentityIntegrations } from "./context";

import { Button } from "@tudomacae/react-primitives/button";

interface AdminAdvertiserProfileDuplicatesProps {
  duplicates: { id: string; title: string }[];
  disabled: boolean;
  onConfirm: () => void;
}

export function AdminAdvertiserProfileDuplicates({
  duplicates,
  disabled,
  onConfirm,
}: AdminAdvertiserProfileDuplicatesProps) {
  const { Link } = useIdentityIntegrations();
  return (
    <div className="space-y-3 rounded-xl bg-muted p-4" role="alert">
      <p className="font-medium">Encontramos perfis que podem representar o mesmo negócio.</p>
      <ul className="space-y-2 text-sm">
        {duplicates.map(duplicate => (
          <li key={duplicate.id}>
            <Link
              href={`/admin/perfis/${duplicate.id}`}
              className="font-medium underline underline-offset-4"
              target="_blank"
            >
              {duplicate.title || "Perfil sem título"}
            </Link>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={onConfirm} disabled={disabled}>
        Criar mesmo assim
      </Button>
    </div>
  );
}
