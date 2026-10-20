import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "macae-classificados";

// TableHead is a <th> — only a real table gives it its border and alignment.
export const InTable = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Anúncio</TableHead>
        <TableHead>Categoria</TableHead>
        <TableHead className="text-right">Visualizações</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Apartamento 2 quartos — Cavaleiros</TableCell>
        <TableCell>Imóveis</TableCell>
        <TableCell className="text-right">1.284</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
