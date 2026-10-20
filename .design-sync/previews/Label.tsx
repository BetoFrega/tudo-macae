import { Checkbox, Input, Label } from "macae-classificados";

export const Default = () => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="whatsapp">WhatsApp para contato</Label>
    <Input id="whatsapp" defaultValue="(22) 99999-0000" />
  </div>
);

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="destaque" defaultChecked />
    <Label htmlFor="destaque">Destacar anúncio na página inicial</Label>
  </div>
);

export const Disabled = () => (
  <div className="group grid max-w-sm gap-2" data-disabled="true">
    <Label htmlFor="conta">Tipo de conta</Label>
    <Input id="conta" defaultValue="Pessoa física" disabled />
  </div>
);
