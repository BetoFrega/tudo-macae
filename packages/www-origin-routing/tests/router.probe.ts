export async function run(entry: typeof import("../router")) {
  const router = entry.createWwwOriginRouter({
    fetchWebWorker: async () => new Response("application"),
    log() {},
  });
  const response = await router.fetch(new Request("https://www.tudomacae.com.br/"));
  if (response.status !== 200 || await response.text() !== "application") throw new Error("Router probe failed");
}
