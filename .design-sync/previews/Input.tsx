import { Input, Label } from "macae-classificados";

export const Default = () => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="titulo">Título do anúncio</Label>
    <Input id="titulo" defaultValue="Apartamento 2 quartos — Cavaleiros" />
  </div>
);

export const Types = () => (
  <div className="grid max-w-sm gap-4">
    <div className="grid gap-2">
      <Label htmlFor="preco">Preço</Label>
      <Input id="preco" type="number" defaultValue={2400} />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="email">E-mail de contato</Label>
      <Input id="email" type="email" placeholder="voce@exemplo.com.br" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="foto">Foto principal</Label>
      <Input id="foto" type="file" />
    </div>
  </div>
);

export const States = () => (
  <div className="grid max-w-sm gap-4">
    <div className="grid gap-2">
      <Label htmlFor="bairro">Bairro</Label>
      <Input id="bairro" placeholder="Ex.: Cavaleiros" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="cidade">Cidade</Label>
      <Input id="cidade" defaultValue="Macaé" disabled />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="cep">CEP</Label>
      <Input id="cep" defaultValue="27" aria-invalid />
      <p className="text-sm text-destructive">Informe um CEP válido.</p>
    </div>
  </div>
);
