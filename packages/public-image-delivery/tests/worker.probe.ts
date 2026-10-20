import type * as entry from "../worker";

export async function run(module: typeof entry) {
  const worker = module.createPublicImageWorker({
    cache: {
      async match() { return undefined; },
      async put() {},
    },
    async fetchOriginal() {
      return new Response("image", {
        headers: { "content-type": "image/webp" },
      });
    },
    async transform() { return { response: new Response("image"), failure: "transformation" as const }; },
    async checkOrigin() { return new Response(null, { status: 200 }); },
    log() {},
  });
  const response = await worker.fetch(
    new Request("https://images.invalid/v1/ad/card/750/ad-images%2Fad%2Fimage.webp"),
    {
      publicHost: "images.invalid",
      classifiedsOrigin: "https://classifieds.invalid",
    },
  );
  if (response.status !== 200) throw new Error("Unexpected image response");
}
