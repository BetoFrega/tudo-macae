import { Label, Switch } from "macae-classificados";

export const States = () => (
  <div className="grid gap-3">
    <div className="flex items-center gap-2">
      <Switch id="s1" defaultChecked />
      <Label htmlFor="s1">Anúncio visível</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="s2" />
      <Label htmlFor="s2">Renovar automaticamente</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="s3" disabled />
      <Label htmlFor="s3">Destaque premium (indisponível)</Label>
    </div>
  </div>
);

export const SettingsRow = () => (
  <div className="grid max-w-md gap-4">
    <div className="flex items-center justify-between gap-6">
      <div>
        <p className="text-sm font-medium">Notificações por e-mail</p>
        <p className="text-sm text-muted-foreground">
          Avisar quando alguém responder ao seu anúncio.
        </p>
      </div>
      <Switch defaultChecked />
    </div>
    <div className="flex items-center justify-between gap-6">
      <div>
        <p className="text-sm font-medium">Mostrar telefone</p>
        <p className="text-sm text-muted-foreground">
          Exibir seu número na página do anúncio.
        </p>
      </div>
      <Switch />
    </div>
  </div>
);
