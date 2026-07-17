/**
 * Thin client for fetching a user's Google OAuth access token from Clerk.
 *
 * Clerk brokers the Google connection (see Settings → Integrations). When we
 * need to call a Google API on a user's behalf we ask Clerk's Backend API for a
 * fresh access token — Clerk refreshes it (and rotates the refresh token) at the
 * moment of the request. Pure `fetch` helper: no Convex ctx, no Node APIs,
 * mirroring `telegram/api.ts`. The Clerk secret key is always passed in
 * explicitly — never read from the environment in here.
 *
 * BAPI reference:
 * https://clerk.com/docs/reference/backend/user/get-user-oauth-access-token
 */

const CLERK_API_BASE = "https://api.clerk.com/v1";

/**
 * Clerk's provider identifier for the Google social connection. Current Clerk
 * uses "google"; older deployments used "oauth_google". If token fetches 404,
 * flip this (or set GOOGLE_OAUTH_PROVIDER on the Convex deployment).
 */
export const GOOGLE_PROVIDER = "google";

export class GoogleAuthError extends Error {
  /** True when the fix is for the user to (re)connect Google, not a bug. */
  reconnectRequired: boolean;

  constructor(message: string, reconnectRequired = false) {
    super(message);
    this.name = "GoogleAuthError";
    this.reconnectRequired = reconnectRequired;
  }
}

export type GoogleOAuthToken = {
  token: string;
  /** Scopes actually granted on this token (from the user's last sign-in). */
  scopes: string[];
};

/**
 * Fetch the current Google access token for a Clerk user. Throws
 * `GoogleAuthError` when the account isn't connected or Clerk can't mint a
 * token (including the known 422 refresh edge case), so callers can prompt a
 * reconnect instead of crashing.
 */
export async function fetchGoogleOAuthToken(
  clerkSecretKey: string,
  clerkUserId: string,
  provider: string = GOOGLE_PROVIDER
): Promise<GoogleOAuthToken> {
  const response = await fetch(
    `${CLERK_API_BASE}/users/${clerkUserId}/oauth_access_tokens/${provider}`,
    { headers: { Authorization: `Bearer ${clerkSecretKey}` } }
  );

  if (!response.ok) {
    // 404 = no such connection; 422 = Clerk couldn't refresh (known issue
    // clerk/javascript#1827). Both are resolved by the user reconnecting.
    const reconnectRequired = response.status === 404 || response.status === 422;
    throw new GoogleAuthError(
      `Clerk OAuth token fetch failed (${response.status})`,
      reconnectRequired
    );
  }

  // Clerk's BAPI returns a top-level array of tokens: `[{ token, scopes }]`.
  // Some SDK/proxy layers wrap it as `{ data: [...] }`. Accept both shapes.
  const raw = (await response.json()) as
    | Array<{ token?: string; scopes?: string[] }>
    | { data?: Array<{ token?: string; scopes?: string[] }> };
  const list = Array.isArray(raw) ? raw : raw.data ?? [];
  const first = list[0];
  if (!first?.token) {
    throw new GoogleAuthError("No Google account connected", true);
  }
  return { token: first.token, scopes: first.scopes ?? [] };
}

/** True if the granted scopes include the one a feature needs. */
export function hasScope(token: GoogleOAuthToken, scope: string): boolean {
  return token.scopes.includes(scope);
}
