export function publicImageRuntimeContext() {
  return {
    service: "nextjs",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production",
    release: process.env.K_REVISION ?? process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
  };
}
