import { Label, Textarea } from "macae-classificados";

export const Default = () => (
  <div className="grid max-w-md gap-2">
    <Label htmlFor="descricao">Descrição do anúncio</Label>
    <Textarea
      id="descricao"
      rows={5}
      defaultValue={
        "Varanda com vista para o mar, 1 vaga de garagem, condomínio com "
        + "piscina e portaria 24h. Aceito visitas aos fins de semana."
      }
    />
    <p className="text-sm text-muted-foreground">
      Descreva o que torna seu anúncio único. Máximo de 1.000 caracteres.
    </p>
  </div>
);

export const Placeholder = () => (
  <div className="grid max-w-md gap-2">
    <Label htmlFor="mensagem">Mensagem ao anunciante</Label>
    <Textarea id="mensagem" placeholder="Olá! Este anúncio ainda está disponível?" />
  </div>
);

export const Disabled = () => (
  <div className="grid max-w-md gap-2">
    <Label htmlFor="motivo">Motivo da recusa</Label>
    <Textarea id="motivo" defaultValue="Anúncio duplicado." disabled />
  </div>
);
