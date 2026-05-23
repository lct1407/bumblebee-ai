import { createLogger } from "../utils/logger.js";

const log = createLogger("auth");

export interface StrapiUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tenant: {
    documentId: string;
    name: string;
    plan: string;
  } | null;
  permissions: string[];
}

// Cache validated Strapi tokens (60s TTL)
const tokenCache = new Map<string, { user: StrapiUser; expiresAt: number }>();

export function authenticateToken(
  token: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return true;
  return token === expectedToken;
}

export function extractToken(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function authenticateStrapiJwt(
  token: string,
  strapiBaseUrl: string,
): Promise<StrapiUser | null> {
  // Check cache
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  try {
    const res = await fetch(`${strapiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = await res.json() as { data: StrapiUser };
    const user = data.data;

    // Cache for 60 seconds
    tokenCache.set(token, { user, expiresAt: Date.now() + 60_000 });

    log.info(`Strapi auth: ${user.email} (tenant: ${user.tenant?.name ?? "none"})`);
    return user;
  } catch (err) {
    log.error("Strapi auth failed", { error: err });
    return null;
  }
}

// Clean expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokenCache) {
    if (now >= val.expiresAt) tokenCache.delete(key);
  }
}, 30_000);
