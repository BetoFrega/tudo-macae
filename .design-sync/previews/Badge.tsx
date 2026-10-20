import { CheckCircle2, Clock } from "lucide-react";
import { Badge } from "macae-classificados";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Ativo</Badge>
    <Badge variant="secondary">Expirado</Badge>
    <Badge variant="destructive">Recusado</Badge>
    <Badge variant="outline">Em análise</Badge>
  </div>
);

export const Categories = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">Imóveis</Badge>
    <Badge variant="secondary">Veículos</Badge>
    <Badge variant="secondary">Beleza e bem-estar</Badge>
    <Badge variant="secondary">Serviços</Badge>
    <Badge variant="secondary">Móveis</Badge>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>
      <CheckCircle2 />
      Anunciante verificado
    </Badge>
    <Badge variant="outline">
      <Clock />
      Expira em 3 dias
    </Badge>
  </div>
);
