"use server";

import { configuredAuthenticationClient } from "@tudomacae/authentication-client/server";
import { cookies } from "next/headers";

export async function clearSessionCookie() {
  const requestId = crypto.randomUUID();
  let statusClass = "unavailable";
  try {
    const cookieStore = await cookies();
    const credential = cookieStore.get("session")?.value;
    const response = await configuredAuthenticationClient().request(
      "/api/auth/sign-out",
      {
        body: {},
        headers: new Headers({ "x-request-id": requestId }),
        ...(credential ? { credential } : {}),
      },
    );
    statusClass = `${Math.floor(response.status / 100)}xx`;
    if (!response.ok) throw new Error("Session revocation refused");
    cookieStore.delete("session");
    cookieStore.delete("verification-refresh");
    return { success: true };
  }
  catch {
    console.error(
      JSON.stringify({
        event: "authentication.logout.failed",
        outcome: "failed",
        service: process.env.K_SERVICE ?? "next",
        environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
        release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
        route: "/api/auth/sign-out",
        requestId,
        statusClass,
      }),
    );
    return { success: false, error: "Failed to clear session" };
  }
}
