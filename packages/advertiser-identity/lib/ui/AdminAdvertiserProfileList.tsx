import { formatSaoPauloDate } from "@tudomacae/civil-time";
import type { IdentityLink } from "./rendering";
import { Badge } from "@tudomacae/react-primitives/badge";
import { Button } from "@tudomacae/react-primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tudomacae/react-primitives/table";
import {
  isClaimableAdvertiserProfile,
  type AdvertiserProfileData,
} from "../../model";

interface AdminAdvertiserProfileListProps {
  Link: IdentityLink;
  profiles: AdvertiserProfileData[];
}

export function AdminAdvertiserProfileList({ Link,
  profiles,
}: AdminAdvertiserProfileListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Título</TableHead>
          <TableHead scope="col">Descrição</TableHead>
          <TableHead scope="col">Data de Criação</TableHead>
          <TableHead scope="col">Última Atualização</TableHead>
          <TableHead scope="col">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map(profile => (
          <TableRow key={profile.id}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <span>{profile.title || "Sem título"}</span>
                {isClaimableAdvertiserProfile(profile) && (
                  <Badge variant="secondary">Reivindicável</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="max-w-xs truncate">
              {profile.description || "Sem descrição"}
            </TableCell>
            <TableCell>
              {formatSaoPauloDate(profile.createdAt)}
            </TableCell>
            <TableCell>
              {profile.updatedAt
                ? formatSaoPauloDate(profile.updatedAt)
                : "-"}
            </TableCell>
            <TableCell>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/perfis/${profile.id}`}>Editar</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
