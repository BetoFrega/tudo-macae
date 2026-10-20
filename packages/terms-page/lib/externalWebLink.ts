export function isExternalWebLink(href?: string): boolean {
  return /^(?:https?:)?\/\//iu.test(href ?? "");
}
