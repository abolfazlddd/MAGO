export function extractBearerToken(authorizationHeader: string) {
  const raw = String(authorizationHeader || "");
  const m = raw.match(/^\s*Bearer\s+(.+)$/i);
  return (m ? m[1] : raw).trim();
}

export function isAdminAuthorized(req: Request) {
  const expected = String(process.env.ADMIN_PASSWORD || "");
  if (!expected) return false;
  const token = extractBearerToken(req.headers.get("authorization") || "");
  return token === expected;
}
