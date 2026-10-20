export const categories = [
  {
    id: "category",
    name: "Serviços",
    isActive: true,
    subcategories: [{ id: "subcategory", name: "Reparos", isActive: true }],
  },
];

export function installResizeObserver() {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
