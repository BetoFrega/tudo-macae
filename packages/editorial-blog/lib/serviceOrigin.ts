const localHostnames = ["localhost", "127.0.0.1", "authentication.test"];

/**
 * The API Worker origin both Blog clients call; plain HTTP is accepted only for local hosts when allowed.
 * The editor client sends the session cookie to this origin, so relaxing a check exposes that session.
 */
export function serviceOrigin(configuration: { origin: string; allowLocal?: boolean }) {
  const origin = new URL(configuration.origin);
  const local = configuration.allowLocal && localHostnames.includes(origin.hostname) && origin.protocol === "http:";
  if ((!local && origin.protocol !== "https:") || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new TypeError("Destino do Blog inválido.");
  return origin;
}
