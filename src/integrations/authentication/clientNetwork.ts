import { headers } from "next/headers";
import { serviceIdentityToken } from "@tudomacae/authentication-client/server";
import z from "zod";

export async function authenticationNetworkHeaders(incoming?: Headers) {
  const forwarded = new Headers();
  // Cloud Run sets K_SERVICE and supplies the identity token; the deployed web Worker sets
  // FORWARD_CLIENT_ADDRESS and answers it through its API binding (`web-worker/outboundRouting.ts`).
  // No deployed profile declares NEXT_PUBLIC_APP_ENV=production.
  if (!process.env.K_SERVICE && !process.env.FORWARD_CLIENT_ADDRESS) return forwarded;
  const source = incoming ?? await headers();
  const address = z.union([z.ipv4(), z.ipv6()]).parse(source.get("cf-connecting-ip"));
  const audience = process.env.AUTHENTICATION_API_URL;
  if (!audience) throw new Error("Authentication audience missing");
  forwarded.set("x-authentication-client-ip", address);
  forwarded.set("authorization", `Bearer ${await serviceIdentityToken(audience)}`);
  return forwarded;
}

/** Forwards the browser's Turnstile token; the authentication Worker verifies it. */
export function withHumanChallenge(headers: Headers, challengeToken: string | undefined) {
  if (challengeToken) headers.set("x-turnstile-token", challengeToken);
  return headers;
}

export async function isHumanChallengeRefusal(response: Response) {
  if (response.status !== 403) return false;
  const body: unknown = await response.clone().json().catch(() => null);
  return typeof body === "object" && body !== null && "code" in body && body.code === "HUMAN_CHALLENGE_FAILED";
}
