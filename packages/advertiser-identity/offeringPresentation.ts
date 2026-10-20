import type { OfferingPrice } from "./offeringCatalog";

export function offeringPriceLabel(price: OfferingPrice) {
  if (price.mode === "on_request") return "Sob consulta";
  const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price.cents / 100);
  return price.mode === "from" ? `A partir de ${formatted}` : formatted;
}
