import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "macae-classificados";

// CardHeader is a layout slot — it only has a shape inside a Card, alongside
// the title/description/action it is designed to lay out.
export const InCard = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Honda Civic 2019 — único dono</CardTitle>
      <CardDescription>Macaé, RJ · 48.000 km</CardDescription>
      <CardAction>
        <Badge>Veículos</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-2xl font-bold">R$ 92.000</p>
    </CardContent>
  </Card>
);

export const TitleOnly = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Resumo da conta</CardTitle>
      <CardDescription>Últimos 30 dias</CardDescription>
    </CardHeader>
  </Card>
);
