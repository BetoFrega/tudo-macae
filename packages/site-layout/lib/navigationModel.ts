export interface NavigationCategory {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface NavigationSection {
  id: string;
  name: string;
  slug: string;
}

export interface EditorialNavigationProps {
  categories: NavigationCategory[];
  sections: NavigationSection[];
}

export type NavigationArea = "news" | "business" | "classifieds" | "general";

export function navigationSectionForPathname(pathname: string): NavigationArea {
  if (/^\/(?:noticia|noticias|assunto|editoria)(?:\/|$)/u.test(pathname)) return "news";
  if (/^\/(?:negocio|negocios)(?:\/|$)/u.test(pathname)) return "business";
  if (/^\/(?:anuncio|anunciante|categoria|publicar)(?:\/|$)/u.test(pathname)) return "classifieds";
  return "general";
}

export function activeCategories(categories: NavigationCategory[]) {
  return categories.filter(category => category.isActive);
}
