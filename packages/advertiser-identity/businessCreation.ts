export type BusinessCreationSurface = "home" | "catalog" | "navigation" | "account";

export const businessCreationPath = "/minha-conta/perfis/novo?origem=catalogo";

export function businessCreationSurface(value: unknown): BusinessCreationSurface {
  return value === "home" || value === "navigation" || value === "account" ? value : "catalog";
}

export function businessCreationDestination(surface: BusinessCreationSurface) {
  return surface === "catalog" ? businessCreationPath : `${businessCreationPath}&entrada=${surface}`;
}
