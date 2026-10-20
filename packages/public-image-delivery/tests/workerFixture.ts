import { vi } from "vitest";
import type { PublicImageCache, PublicImageTransformOptions } from "../worker";

export const configuration = {
  publicHost: "images.tudomacae.com.br",
  classifiedsOrigin: "https://api.tudomacae.com.br",
};

/** A Hosted read never transforms or guards: Hosted Images already returns the negotiated variant. */
export const hostedOnly = {
  transform: async (origin: string): Promise<never> => {
    throw new Error(`Hosted delivery must not transform ${origin}`);
  },
  checkOrigin: async (origin: string): Promise<never> => {
    throw new Error(`Hosted delivery must not guard ${origin}`);
  },
};

export type FetchOrigin = ReturnType<typeof vi.fn<(input: string, options?: PublicImageTransformOptions) => Promise<Response>>>;

export function createFetchOrigin(): FetchOrigin {
  return vi.fn<(input: string, options?: PublicImageTransformOptions) => Promise<Response>>().mockImplementation(async () =>
    new Response("transformed", {
      status: 200,
      headers: { "content-type": "image/webp" },
    }),
  );
}

export function validRequest(
  path = "/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp",
  headers?: HeadersInit,
) {
  return new Request(
    `https://${configuration.publicHost}${path}`,
    headers ? { headers } : undefined,
  );
}

export function memoryCache(): PublicImageCache {
  const values = new Map<string, Response>();
  return {
    async match(request) {
      return values.get(request.url)?.clone();
    },
    async put(request, response) {
      values.set(request.url, response.clone());
    },
  };
}
