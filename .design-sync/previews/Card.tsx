import { MapPin } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "macae-classificados";

export const AdCard = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Apartamento 2 quartos — Cavaleiros</CardTitle>
      <CardDescription>
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" />
          Macaé, RJ · publicado há 2 dias
        </span>
      </CardDescription>
      <CardAction>
        <Badge>Imóveis</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-2xl font-bold">R$ 2.400/mês</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Varanda com vista para o mar, 1 vaga de garagem, condomínio com
        piscina e portaria 24h.
      </p>
    </CardContent>
    <CardFooter className="gap-2">
      <Button>Falar com anunciante</Button>
      <Button variant="outline">Salvar</Button>
    </CardFooter>
  </Card>
);

export const Simple = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Serviços de beleza</CardTitle>
      <CardDescription>128 anúncios ativos em Macaé</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Cabeleireiros, manicures, barbearias e estética.
      </p>
    </CardContent>
  </Card>
);

export const WithFooterAction = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Complete seu perfil</CardTitle>
      <CardDescription>
        Anunciantes com perfil completo recebem mais contatos.
      </CardDescription>
    </CardHeader>
    <CardFooter>
      <Button className="w-full">Completar agora</Button>
    </CardFooter>
  </Card>
);
