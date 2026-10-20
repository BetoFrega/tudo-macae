import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "macae-classificados";

// TableCaption renders below the table (caption-bottom) in muted text.
export const InTable = () => (
  <Table>
    <TableCaption>Seus anúncios publicados nos últimos 30 dias.</TableCaption>
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
    </TableBody>
  </Table>
);
