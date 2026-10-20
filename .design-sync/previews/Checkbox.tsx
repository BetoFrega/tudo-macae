import { Checkbox, Label } from "macae-classificados";

export const States = () => (
  <div className="grid gap-3">
    <div className="flex items-center gap-2">
      <Checkbox id="c1" defaultChecked />
      <Label htmlFor="c1">Aceito os termos de uso</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="c2" />
      <Label htmlFor="c2">Quero receber novidades por e-mail</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="c3" disabled />
      <Label htmlFor="c3">Renovação automática (indisponível)</Label>
    </div>
  </div>
);

export const FilterList = () => (
  <fieldset className="grid gap-3">
    <legend className="mb-2 text-sm font-medium">Filtrar por categoria</legend>
    <div className="flex items-center gap-2">
      <Checkbox id="f1" defaultChecked />
      <Label htmlFor="f1">Imóveis</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="f2" defaultChecked />
      <Label htmlFor="f2">Veículos</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="f3" />
      <Label htmlFor="f3">Serviços</Label>
    </div>
  </fieldset>
);
