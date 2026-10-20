import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 5000 },
);
export async function isIdentityReader(
  request: Request,
  env: Env,
  keys: JWTVerifyGetKey = googleKeys,
) {
  const authorization = request.headers.get("authorization") ?? "";
  if (
    !authorization.startsWith("Bearer ")
    || authorization.length > 8192
    || !env.OIDC_AUDIENCE
    || !env.OIDC_SERVICE_ACCOUNT
  )
    return false;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.OIDC_AUDIENCE,
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    return (
      payload.email === env.OIDC_SERVICE_ACCOUNT
      && payload.email_verified === true
    );
  }
  catch {
    return false;
  }
}
