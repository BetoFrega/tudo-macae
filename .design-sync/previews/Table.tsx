import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "macae-classificados";

export const AdsTable = () => (
  <Table>
    <TableCaption>Seus anúncios publicados nos últimos 30 dias.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Anúncio</TableHead>
        <TableHead>Categoria</TableHead>
        <TableHead>Situação</TableHead>
        <TableHead className="text-right">Visualizações</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">
          Apartamento 2 quartos — Cavaleiros
        </TableCell>
        <TableCell>Imóveis</TableCell>
        <TableCell><Badge>Ativo</Badge></TableCell>
        <TableCell className="text-right">1.284</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">
          Honda Civic 2019 — único dono
        </TableCell>
        <TableCell>Veículos</TableCell>
        <TableCell><Badge>Ativo</Badge></TableCell>
        <TableCell className="text-right">876</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">
          Design de sobrancelhas em domicílio
        </TableCell>
        <TableCell>Beleza e bem-estar</TableCell>
        <TableCell><Badge variant="secondary">Expirado</Badge></TableCell>
        <TableCell className="text-right">312</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Sofá 3 lugares seminovo</TableCell>
        <TableCell>Móveis</TableCell>
        <TableCell><Badge variant="outline">Em análise</Badge></TableCell>
        <TableCell className="text-right">54</TableCell>
      </TableRow>
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell colSpan={3}>Total</TableCell>
        <TableCell className="text-right">2.526</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
);

export const Compact = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Categoria</TableHead>
        <TableHead className="text-right">Anúncios</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Imóveis</TableCell>
        <TableCell className="text-right">412</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Veículos</TableCell>
        <TableCell className="text-right">289</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Serviços</TableCell>
        <TableCell className="text-right">173</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
