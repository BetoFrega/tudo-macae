// vinext rejects lookahead matchers as ReDoS risks, so the proxy matches every
// path and this predicate keeps assets, API routes and sitemaps out of it.
const unproxiedPath = /^\/(?:api(?:\/|$)|_next(?:\/|$)|sitemaps(?:\/|$)|.*\.(?:svg|png|jpg|jpeg|webp|avif|gif|ico|woff2?|ttf|otf|eot|css|js|mjs|map|json|xml|txt|webmanifest|pdf)$)/u;
const proxiedPrefix = /^\/(?:$|busca$|(?:noticia|anuncio|categoria|anunciante|negocios|negocio)\/)/u;

export function proxyHandles(pathname: string, headers: { get(name: string): string | null }): boolean {
  if (headers.get("rsc") === "1" || headers.get("host") === "mcp.tudomacae.com.br") return true;
  return proxiedPrefix.test(pathname) || !unproxiedPath.test(pathname);
}
