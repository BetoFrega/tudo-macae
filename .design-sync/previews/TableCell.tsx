import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "macae-classificados";

// TableCell is a <td> — shown here in the row shapes it is used in: plain
// text, an emphasised first column, a status badge and a right-aligned number.
export const InTable = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Anúncio</TableHead>
        <TableHead>Situação</TableHead>
        <TableHead className="text-right">Visualizações</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">Honda Civic 2019</TableCell>
        <TableCell><Badge>Ativo</Badge></TableCell>
        <TableCell className="text-right">876</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Sofá 3 lugares seminovo</TableCell>
        <TableCell><Badge variant="outline">Em análise</Badge></TableCell>
        <TableCell className="text-right">54</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
