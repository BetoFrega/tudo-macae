export function authenticationRetryAfter(response: Response) {
  if (response.status !== 429) return null;
  const seconds = Number(response.headers.get("x-retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
}
