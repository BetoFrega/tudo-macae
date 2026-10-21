// vinext rejects lookahead matchers as ReDoS risks, so the proxy matches every
// path and this predicate keeps assets, API routes and sitemaps out of it.
const unproxiedPath = /^\/(?:api(?:\/|$)|_next(?:\/|$)|sitemaps(?:\/|$)|.*\.(?:svg|png|jpg|jpeg|webp|avif|gif|ico|woff2?|ttf|otf|eot|css|js|mjs|map|json|xml|txt|webmanifest|pdf)$)/u;
const proxiedPrefix = /^\/(?:$|busca$|(?:noticia|anuncio|categoria|anunciante|negocios|negocio)\/)/u;

const MCP_HOSTNAME = "mcp.tudomacae.com.br";

/** Compares the hostname without port or case, as the Host header may carry either. */
export function isMcpHost(host: string): boolean {
  return host.split(":", 1)[0]!.toLowerCase() === MCP_HOSTNAME;
}

export function proxyHandles(pathname: string, headers: { get(name: string): string | null }): boolean {
  if (headers.get("rsc") === "1" || isMcpHost(headers.get("host") ?? "")) return true;
  return proxiedPrefix.test(pathname) || !unproxiedPath.test(pathname);
}
