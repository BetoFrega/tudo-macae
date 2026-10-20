import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "macae-classificados";

export const Closed = () => (
  <div className="grid max-w-sm gap-4">
    <div className="grid gap-2">
      <Label htmlFor="cat">Categoria</Label>
      <Select defaultValue="imoveis">
        <SelectTrigger id="cat" className="w-full">
          <SelectValue placeholder="Escolha uma categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="imoveis">Imóveis</SelectItem>
          <SelectItem value="veiculos">Veículos</SelectItem>
          <SelectItem value="servicos">Serviços</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="grid gap-2">
      <Label htmlFor="ord">Ordenar por</Label>
      <Select>
        <SelectTrigger id="ord" size="sm" className="w-full">
          <SelectValue placeholder="Mais recentes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recentes">Mais recentes</SelectItem>
          <SelectItem value="preco">Menor preço</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
);

// SelectContent portals to document.body, so the open state only renders in a
// single-story card (cardMode "single" in cfg.overrides).
export const Open = () => (
  <div className="max-w-sm">
    <Select defaultValue="imoveis" open>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Produtos</SelectLabel>
          <SelectItem value="imoveis">Imóveis</SelectItem>
          <SelectItem value="veiculos">Veículos</SelectItem>
          <SelectItem value="moveis">Móveis</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Serviços</SelectLabel>
          <SelectItem value="beleza">Beleza e bem-estar</SelectItem>
          <SelectItem value="reformas">Reformas</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);
